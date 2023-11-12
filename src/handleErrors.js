require("dotenv").config();
const mysql = require("mysql");

const othubdb_connection = mysql.createConnection({
  host: process.env.DBHOST,
  user: process.env.DBUSER,
  password: process.env.DBPASSWORD,
  database: process.env.OTHUB_DB,
});

const wallet_array = JSON.parse(process.env.WALLET_ARRAY);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function executeOTHubQuery(query, params) {
  return new Promise((resolve, reject) => {
    othubdb_connection.query(query, params, (error, results) => {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

async function getOTHubData(query, params) {
  try {
    const results = await executeOTHubQuery(query, params);
    return results;
  } catch (error) {
    console.error("Error executing query:", error);
    throw error;
  }
}

module.exports = {
  handleError: async function handleError(message) {
    try {
      console.log(JSON.stringify(message));
      let query;
      let params;
      if (message.error.name === "jsonld.ValidationError") {
        console.log(
          `${wallet_array[message.index].name} wallet ${
            wallet_array[message.index].public_key
          }: Create failed due to safe mode validation. Abandoning...`
        );
        query = `UPDATE txn_header SET progress = ?, txn_data = ? WHERE approver = ? AND request = 'Create-n-Transfer' AND progress = ?`;
        params = [
          "ABANDONED",
          `{"data":"bad"}`,
          wallet_array[message.index].public_key,
          "PROCESSING",
        ];
        await getOTHubData(query, params)
          .then((results) => {
            return results;
          })
          .catch((error) => {
            console.error("Error retrieving data:", error);
          });
        return;
      }

      if (message.request === "Create-n-Transfer") {
        console.log(
          `${wallet_array[message.index].name} wallet ${
            wallet_array[message.index].public_key
          }: Create failed. Setting back to pending in 3 minutes...`
        );
        await sleep(180000);

        query = `UPDATE txn_header SET progress = ?, approver = ? WHERE approver = ? AND request = 'Create-n-Transfer' AND progress = ?`;
        params = [
          "PENDING",
          null,
          wallet_array[message.index].public_key,
          "PROCESSING",
        ];
        await getOTHubData(query, params)
          .then((results) => {
            return results;
          })
          .catch((error) => {
            console.error("Error retrieving data:", error);
          });
        return;
      }

      if (message.request === "Transfer") {
        console.log(
          `${wallet_array[message.index].name} wallet ${
            wallet_array[message.index].public_key
          }: Transfer failed. Retrying in 1 minute...`
        );
        await sleep(60000);

        query = `INSERT INTO txn_header (txn_id, progress, approver, api_key, request, network, app_name, txn_description, txn_data, ual, keywords, state, txn_hash, txn_fee, trac_fee, epochs, receiver) VALUES (UUID(),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
        params = [
          "TRANSFER-FAILED",
          wallet_array[message.index].public_key,
          null,
          "Create-n-Transfer",
          message.network,
          null,
          null,
          null,
          message.ual,
          null,
          null,
          null,
          null,
          null,
          null,
          message.receiver,
        ];
        await getOTHubData(query, params)
          .then((results) => {
            //console.log('Query results:', results);
            return results;
            // Use the results in your variable or perform further operations
          })
          .catch((error) => {
            console.error("Error retrieving data:", error);
          });

        query = `UPDATE txn_header SET updated_at = ?, txn_description = ? WHERE progress = ? AND ual = ? AND request = 'Create-n-Transfer'`;
        params = [
          new Date(),
          "TRANSFER RETRY ATTEMPT",
          "TRANSFER-FAILED",
          message.ual,
        ];
        await getOTHubData(query, params)
          .then((results) => {
            //console.log('Query results:', results);
            return results;
            // Use the results in your variable or perform further operations
          })
          .catch((error) => {
            console.error("Error retrieving data:", error);
          });
        return;
      }

      console.log(
        `${wallet_array[message.index].name} wallet ${
          wallet_array[message.index].public_key
        }: Unexpected Error. Abandoning...`
      );
      query = `UPDATE txn_header SET progress = ?, txn_data = ? WHERE approver = ? AND request = 'Create-n-Transfer' AND progress = ?`;
      params = [
        "ABANDONED",
        `{"data":"bad"}`,
        wallet_array[message.index].public_key,
        "PROCESSING",
      ];
      await getOTHubData(query, params)
        .then((results) => {
          return results;
        })
        .catch((error) => {
          console.error("Error retrieving data:", error);
        });
      return;
    } catch (error) {
      console.log(error);
    }
  },
};

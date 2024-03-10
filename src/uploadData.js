require("dotenv").config();
const queryTypes = require("../util/queryTypes");
const queryDB = queryTypes.queryDB();
const DKGClient = require("dkg.js");
const handleErrors = require("./handleErrors.js");

const OT_NODE_TESTNET_PORT = process.env.OT_NODE_TESTNET_PORT;
const OT_NODE_MAINNET_PORT = process.env.OT_NODE_MAINNET_PORT;

const testnet_node_options = {
  endpoint: process.env.OT_NODE_HOSTNAME,
  port: OT_NODE_TESTNET_PORT,
  useSSL: true,
  maxNumberOfRetries: 100,
};

const mainnet_node_options = {
  endpoint: process.env.OT_NODE_HOSTNAME,
  port: OT_NODE_MAINNET_PORT,
  useSSL: true,
  maxNumberOfRetries: 100,
};

const testnet_dkg = new DKGClient(testnet_node_options);
const mainnet_dkg = new DKGClient(mainnet_node_options);

const wallet_array = JSON.parse(process.env.WALLET_ARRAY);

module.exports = {
  uploadData: async function uploadData(data) {
    try {
      let index = wallet_array.findIndex(
        (obj) => obj.public_key == data.approver
      );

      let query = `UPDATE txn_header SET progress = ?, approver = ? WHERE txn_id = ?`;
      let params = ["PROCESSING", data.approver, data.txn_id];
      await queryDB
        .getData(query, params)
        .then((results) => {
          //console.log('Query results:', results);
          return results;
          // Use the results in your variable or perform further operations
        })
        .catch((error) => {
          console.error("Error retrieving data:", error);
        });

      let dkg_txn_data = JSON.parse(data.txn_data);
      if (!dkg_txn_data["@context"]) {
        dkg_txn_data["@context"] = "https://schema.org";
      }

      console.log(
        `${wallet_array[index].name} wallet ${wallet_array[index].public_key}: Creating next asset on ${data.network}.`
      );

      let dkg = testnet_dkg;
      let environment;
      if (data.network === "otp:20430" || data.network === "gnosis:10200") {
        dkg = testnet_dkg;
        environment = "testnet";
      }

      if (
        (data.network === "otp:2043" || data.network === "gnosis:100") &&
        data.api_key === process.env.MASTER_KEY
      ) {
        dkg = mainnet_dkg;
        environment = "mainnet";
      }

      let dkg_create_result = await dkg.asset
        .create(
          {
            public: dkg_txn_data,
          },
          {
            environment: environment,
            epochsNum: data.epochs,
            maxNumberOfRetries: 30,
            frequency: 2,
            contentType: "all",
            keywords: data.keywords,
            blockchain: {
              name: data.network,
              publicKey: wallet_array[index].public_key,
              privateKey: wallet_array[index].private_key,
              handleNotMinedError: true,
            },
          }
        )
        .then((result) => {
          return result;
        })
        .catch(async (error) => {
          error_obj = {
            error: error.message,
            index: index,
            request: "Create-n-Transfer",
          };
          throw new Error(JSON.stringify(error_obj));
        });

      query = `UPDATE txn_header SET progress = ?, ual = ?, state = ? WHERE txn_id = ?`;
      params = [
        "CREATED",
        dkg_create_result.UAL,
        dkg_create_result.publicAssertionId,
        data.txn_id,
      ];
      await queryDB
        .getData(query, params)
        .then((results) => {
          //console.log('Query results:', results);
          return results;
          // Use the results in your variable or perform further operations
        })
        .catch((error) => {
          console.error("Error retrieving data:", error);
        });

      console.log(
        `${wallet_array[index].name} wallet ${wallet_array[index].public_key}: Created UAL ${dkg_create_result.UAL}. Transfering to ${data.receiver}...`
      );

      await dkg.asset
        .transfer(dkg_create_result.UAL, data.receiver, {
          environment: environment,
          epochsNum: data.epochs,
          maxNumberOfRetries: 30,
          frequency: 2,
          contentType: "all",
          keywords: data.keywords,
          blockchain: {
            name: data.network,
            publicKey: wallet_array[index].public_key,
            privateKey: wallet_array[index].private_key,
            handleNotMinedError: true,
          },
        })
        .then(async (result) => {
          console.log(
            `${wallet_array[index].name} wallet ${wallet_array[index].public_key}: Transfered ${dkg_create_result.UAL} to ${data.receiver}.`
          );

          query = `UPDATE txn_header SET progress = ? WHERE txn_id = ?`;
          params = ["COMPLETE", data.txn_id];
          await queryDB
            .getData(query, params)
            .then((results) => {
              //console.log('Query results:', results);
              return results;
              // Use the results in your variable or perform further operations
            })
            .catch((error) => {
              console.error("Error retrieving data:", error);
            });
        })
        .catch(async (error) => {
          error_obj = {
            error: error.message,
            index: index,
            request: "Transfer",
            ual: dkg_create_result.UAL,
            network: data.network,
            receiver: data.receiver,
          };
          throw new Error(JSON.stringify(error_obj));
        });
      return;
    } catch (error) {
      let message = JSON.parse(error.message);
      await handleErrors.handleError(message);
    }
  },
};

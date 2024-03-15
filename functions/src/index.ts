import {onRequest} from "firebase-functions/v1/https";
import {LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Connection, clusterApiUrl, PublicKey } from "@solana/web3.js";
//import "dotenv/config"
const express = require("express");
const cors = require("cors");


const loadSearchAddressList = async (nativeAddress: any, acceptedSPLMintAddressList: any) => {
    const connection = new Connection(clusterApiUrl('mainnet-beta'));
    console.log(`✅ Connected!`)
    let finalSearchAddressList: any[] = [];
    finalSearchAddressList.push({
        pubkey: new PublicKey(nativeAddress),
        mint: '-',
        name: 'SOL'
    })

    for (let i = 0; i < acceptedSPLMintAddressList.length; i++) {

        let mint_address_object = acceptedSPLMintAddressList[i];

        let spl_account = await connection.getParsedTokenAccountsByOwner(new PublicKey(nativeAddress), { mint: new PublicKey(mint_address_object.mint) })

        let splAccount = JSON.parse(JSON.stringify(spl_account));

        let spl_account_pubkey = splAccount.value[0].pubkey;

        finalSearchAddressList.push({
            pubkey: new PublicKey(spl_account_pubkey),
            mint: mint_address_object.mint,
            name: mint_address_object.name,
        })
        
    }
    return finalSearchAddressList;
}

const loadTransactions = async (nativeAddress: any, acceptedSPLMintAddressList: any, numTx: any) => {

    const connection = new Connection(clusterApiUrl('mainnet-beta'));
    console.log(`✅ Connected!`)

    let finalSearchAddressList = await loadSearchAddressList(nativeAddress, acceptedSPLMintAddressList);

    console.log(JSON.stringify(finalSearchAddressList));
    
    let transferTransactionList: any[] = [];

    for (var x = 0; x < finalSearchAddressList.length; x++) {

        let searchAddressObject = finalSearchAddressList[x];

        let pubKey = searchAddressObject.pubkey;
        let mintAdd = searchAddressObject.mint;
        let name = searchAddressObject.name;

        //fetching transaction info on each address
        let transactionList = await connection.getSignaturesForAddress(pubKey, { limit: numTx });
        //console.log(transactionList);
        let signatureList = transactionList.map(transaction => transaction.signature);
        let transactionDetails = await connection.getParsedTransactions(signatureList, {
            maxSupportedTransactionVersion: 0,
        });

        //readind transaction info
        transactionList.forEach((transaction, i) => {
            const date = new Date(transaction.blockTime! * 1000);
            const transactionInstructions = transactionDetails[i]?.transaction.message.instructions;
            const transactionInstructionsJSON = JSON.parse(JSON.stringify(transactionInstructions));

            //console.log(JSON.stringify(transactionDetails[i]));

            transactionInstructionsJSON?.forEach((instruction: any, n: any) => {
                //native solana tracking
                if (x == 0 && instruction.parsed && instruction.parsed.type == 'transfer' && instruction.parsed.info.lamports) {
                    //console.log(JSON.stringify(instruction));
                    try {
                        const lamports = instruction.parsed.info.lamports;
                        const destination = instruction.parsed.info.destination;
                        const source = instruction.parsed.info.source;

                        if (destination == pubKey && transaction.confirmationStatus == 'finalized' && lamports > 0) {
                            transferTransactionList.push({
                                time: date,
                                signature: transaction.signature,
                                source: source,
                                destination: destination,
                                token: name,
                                uiAmount: lamports / LAMPORTS_PER_SOL
                            })

                            //console.log(transferTransactionList);
                        }
                    }
                    catch (e: any) {
                        console.log(e.message);
                    }
                }
                else if (x > 0 && instruction.parsed! && instruction.parsed.type == 'transferChecked' && instruction.parsed.info.tokenAmount.uiAmount!) {
                    //console.log(JSON.stringify(instruction));
                    try {
                        const uiAmount = instruction.parsed.info.tokenAmount.uiAmount;
                        const destination = instruction.parsed.info.destination;
                        const mint = instruction.parsed.info.mint;
                        const source = instruction.parsed.info.source;

                        if (destination == pubKey && transaction.confirmationStatus == 'finalized' && uiAmount > 0 && mint == mintAdd) {
                            transferTransactionList.push({
                                time: date,
                                signature: transaction.signature,
                                source: source,
                                destination: destination,
                                token: name,
                                uiAmount: uiAmount
                            })
                            console.log(transferTransactionList);
                        }
                    }
                    catch (e) {
                        console.log(e);
                    }
                }

            })
        })

    }
    console.log(JSON.stringify(transferTransactionList));
    return (JSON.stringify(transferTransactionList));
}

//loadTransactions(searchAddress, acceptedSPLMintAddressList, 50);

const app = express();
app.use(cors({ origin: true }));

app.get("/getLogs", async (req: any, res: any) => {
    let address = req.query.address;
    if (!address) {
        return res.status(500).send({
            status: "Failed",
            message: "address parameter in request body not found",
        });
    }
    console.log(address);
    // let numTx = req.query.numtx;

    const acceptedSPLMintAddressList = [
        {
            mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            name: 'USDC'
        }]
    try {
        let transferTransactionList = await loadTransactions(address, acceptedSPLMintAddressList, 50);
    
        return res.status(200).send({
            status: "Success",
            txlist: transferTransactionList,
        });

    }
    catch (e: any) {
        return res.status(500).send({
            status: "Failed",
            message: e.message,
        });
    }
    
});

// app.listen(3000, function () {
//     console.log("Server running on port 3000")
// })

exports.soltxnlogs = onRequest(app);

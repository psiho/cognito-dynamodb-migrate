#!/usr/bin/env node

/***********************************************************
 *
 *   Migration tool for Cognito & DynamoDB
 *
 ***********************************************************/

const { spawn } = require('child_process')
const util = require('util')
const fs = require('fs')
const path = require('path')


/******** CONFIG *******************************************/

const oldCognitoUserPool = '' // Cognito UserPool ID, i.e.: eu-west-1_XXXXXXXXX
const oldDynamoDbTable = '' // table name, i.e.: table_myDynamoDBTable
const newDynamoDbTable = '' // table name, i.e.: table_myNewDynamoDBTable

/***********************************************************/


// promisify some functions
const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)
const appendFile = util.promisify(fs.appendFile)

const runInShell = async (command, arrArgs, options = {}) => {
    console.log(`-------------------- command '${command}' running  >>>`)
    try {
        return new Promise((resolve, reject) => {
            const execCommand = spawn(command, arrArgs, options)
            execCommand.on('error', (error) => {
                console.error(`error: ${error.message.toString()}`)
                reject(error)
            })
            execCommand.on('close', code => {
                console.log(`		>>>  command '${command}' exited with code ${code} ------------------------------------`)
                if (code !== 0) process.exit(3)
                resolve(code)
            })
        })
    }
    catch (error) {
        console.error(`ERROR! Running '${command}' returned error:`, error)
        process.exit(3)
    }

}

/* import active Cognito users and convert to CSV for manual import through AWS console  */
const exportOldCognitoUsersToCsv = async () => {
    console.log('getting old Cognito User Pool users to JSON...')
    if (fs.existsSync(path.join(__dirname,'outputs', oldCognitoUserPool + '.json'))) {
        fs.unlinkSync(path.join(__dirname,'outputs', oldCognitoUserPool + '.json'))
    }
    await runInShell('cbr', ['backup', '--pool', oldCognitoUserPool, '--dir', path.join(__dirname, 'outputs')], {stdio: 'inherit'})
    await writeFile(path.join(__dirname,'outputs', oldCognitoUserPool + '.parsed.csv'), 'cognito:username,cognito:mfa_enabled,phone_number_verified,updated_at,email,email_verified,name,given_name,family_name,middle_name,nickname,preferred_username,profile,picture,website,gender,birthdate,zoneinfo,locale,phone_number,address\n')
    let res = await readFile(path.join(__dirname,'outputs', oldCognitoUserPool+'.json'))
    try {
        res = JSON.parse(res)
    } catch (e) {
        throw new Error ('Error parsing Cognito JSON')
    }
    console.log(`JSON parsed. ${res.length} users exported . Creating CSV...`)
    let count = 0
    for (let i = res.length-1; i>=0; i--) {
        r = res[i]
        let d = new Date(r.UserCreateDate)
        let o = {
            Username: r.Username,
            Enabled: r.Enabled,
            UserStatus: r.UserStatus,
            mfa_enabled: false,
            phone_number_verified: false,
            UserCreateDate: parseInt(d.getTime() / 1000),
            email: r.Attributes.find(a => a.Name === 'email').Value,
            email_verified: r.Attributes.find(a => a.Name === 'email_verified').Value
        }
        if (o.Enabled && o.UserStatus === 'CONFIRMED' && o.email_verified === "true") {
            count++
            await appendFile(path.join(__dirname,'outputs', oldCognitoUserPool + '.parsed.csv'),`${o.Username},${o.mfa_enabled},${o.phone_number_verified},${o.UserCreateDate},${o.email},${o.email_verified},,,,,,,,,,,,,,,\n`)
        }
    }
    console.log(`CSV created. ${count} users after filtering.`)
}

const exportOldDynamoDBTable = async () => {
    if (fs.existsSync(path.join(__dirname,'outputs', oldDynamoDbTable + '.old.json'))) {
        fs.unlinkSync(path.join(__dirname,'outputs', oldDynamoDbTable + '.old.json'))
    }
    let out = fs.openSync(path.join(__dirname,'outputs', oldDynamoDbTable + '.old.json') , "a")
    console.log('getting old DynamoDB table data...')
    // query can be used to filter data, here, complete table is exported
    await runInShell('aws', ['dynamodb', 'scan', '--table-name', oldDynamoDbTable], {stdio: [process.stdin, out, process.stdout]})
    console.log('got old DynamoDB data.')
}


const importToNewDynamoDBTable = async () => {
    let res = await readFile(path.join(__dirname,'outputs', oldDynamoDbTable + '.old.json'))
    try {
        res = JSON.parse(res)
    } catch (e) {
        throw new Error ('Error parsing DynamoDB JSON')
    }
    console.log(`got ${res.Items.length} items from DynamoDB. Importing to new table...`)
    let dbcount = 0
    let consumedCapacity = 0
    for (let i = 0; i<res.Items.length; i++) {
        let item = res.Items[i]
        if (true) { // place do put some local filters
            //console.log(item)
            await runInShell('aws', ['dynamodb', 'put-item', '--table-name', newDynamoDbTable, '--item', JSON.stringify(item)], {stdio: 'inherit'})
            //console.log('... written.')
            dbcount++
        }
    }
    console.log(`${dbcount} items (after filtering) imported into new DynamoDB table`)
}

// run all tasks
exportOldCognitoUsersToCsv()
    .then(exportOldDynamoDBTable)
    .then(importToNewDynamoDBTable)
    .catch(e=>{console.log(e)})



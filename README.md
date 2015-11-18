cargografias-popit-loader
=========================

This is used to populate the cargografias popit instance from a google spreadsheet exported as json

1) Install node
`sudo apt-get install npm`

2) Install Dependencies
`npm install`

3) Create a json config file (see config json example at final of this README) and put in config folder. Name it: `<instanceName>.json`

4) To execute it
`node process.js node process.js <command> <instanceName>`

4b) In debian:
`nodejs process.js <instanceName>`

Available commands
------------

Import
====
Imports all the information from json. If you want to see the right format you must check Cargografias Protocol Document.

Delete
===
Removes all the entitites from the database:
- Memberships
- Organizations
- Persons

updatephotos
===
Makes an upload for all the photos to a propper server.


Sample config json
------------------
```json
{
    "host": "<INSTANCE_NAME>.<POPIT_URL>",
    "Apikey": "YOUR API KEY", 
    "gsheetsUrl": "https://spreadsheets.google.com/feeds/list/<SPREADSHEET_ID>/<SHEET_ID>/public/values?alt=json"
}
```

Where

INSTANCE_NAME
================

Name of your popit instance.

POPIT_URL
================

Url for the popit server

API_KEY
================

ApiKey given by popit to access the api



SPREADSHEET_ID
================

Google Spreasheet ID, that might look like "1qKk_stiteudp5alMuOEyyLoU5YLvB1iJMi8eIAtToXw"
Like https://spreadsheets.google.com/feeds/list/1qKk_stiteudp5alMuOEyyLoU5YLvB1iJMi8eIAtToXw/od6/public/values?alt=json
SHEET_ID
================
Number of the Spreadsheet, that might look like  "od6"
like https://spreadsheets.google.com/feeds/list/1qKk_stiteudp5alMuOEyyLoU5YLvB1iJMi8eIAtToXw/od6/public/values?alt=json


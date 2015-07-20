cargografias-popit-loader
=========================

This is used to populate the cargografias popit instance from a google spreadsheet exported as json


1) Install Dependencies
`npm install`

2) Add a config json in the `config` folder named `<instanceName>.json`

3) To execute it
`node process.js <instanceName>`


Sample config.json
------------------
```json
{
    "host": "<INSTANCE_NAME>.popit.mysociety.org",
    "Apikey": "YOUR API KEY", 
    "gsheetsUrl": "https://spreadsheets.google.com/feeds/list/<SPREADSHEET_ID>/<SHEET_ID>/public/values?alt=json"
}
```

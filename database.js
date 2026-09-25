const sqlite3 = require('sqlite3').verbose();
const path = require('path');


const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Eroare la conectarea cu baza de date:', err.message);
    } else {
        console.log('Conectat cu succes la baza de date SQLite.');
    }
});


db.serialize(() => {

    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        request_data TEXT,
        response_data TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    

});


const logAction = (action, requestData, responseData) => {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO audit_logs (action, request_data, response_data) VALUES (?, ?, ?)`;
        db.run(query, [action, JSON.stringify(requestData), JSON.stringify(responseData)], function(err) {
            if (err) {
                console.error('Eroare la salvarea log-ului:', err.message);
                reject(err);
            } else {
                resolve(this.lastID);
            }
        });
    });
};

module.exports = {
    db,
    logAction
};

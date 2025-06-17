const express = require('express')
const sqlite3 = require('sqlite3').verbose();  // Importa o SQLite3
const app = express()

// Conectando ao banco de dados SQLite
const db = new sqlite3.Database('./maternidadeSemClicheDB.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
  } else {
    console.log('Conexão com o banco de dados estabelecida.');
  }
});
// Exporta a conexão para ser utilizada em outros arquivos
module.exports = db;

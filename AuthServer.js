const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { OAuth2Client } = require('google-auth-library');
require("dotenv").config();
const app = express();
const port = 3000;

const db = require("./connection");

// Configurar o Express para responder com JSON
app.use(express.json());

let refreshTokens = [];

// Rota de exemplo para obter dados
app.get("/usuarios", (req, res) => {
  db.all("SELECT * FROM usuarios", [], (err, rows) => {
    if (err) {
      res.status(400).json({ error: err.mensagem });
      return;
    }
    res.json({ usuarios: rows });
  });
});

app.post("/login", (req, res) => {
  const email = req.body.email;
  const senha = req.body.senha;

  // Usando parâmetros preparados para evitar SQL Injection
  const sql = "SELECT * FROM usuarios WHERE email = ?";

  db.get(sql, [email], (err, row) => {
    if (err) {
      return res.status(400).json({ error: err.mensagem });
    }

    if (!row) {
      res.status(401).json({ mensagem: "Email ou senha inválidos" });
    }

    bcrypt.compare(senha, row.senha, (err, result) => {
      if (err) {
        return res.status(500).json({ mensagem: "erro ao comparar senha" });
      }

      // Verifica se o usuário foi encontrado
      if (!result) {
        return res.status(401).json({ mensagem: "Email ou senha inválidos" });
      } else {
        const user = {
          nome: row.nome,
          email: row.email,
          user_id: row.user_id,
          telefone: row.telefone,
        };
        //ciração do TOKEN DE ACESSO com as informações passadas
        const accessToken = GenerateAccessToken(user);
        //criação do TOKEN DE ATUALIZAÇÃO com as informações passadas
        const refreshToken = generateRefreshToken(user);
        return res.json({ accessToken: accessToken, refreshToken: refreshToken });
      }
    });
  });
});

app.post("/register", async (req, res) => {
  const { email, senha, nome, nascimento, telefone, cpf } = req.body;

  if (!email || !senha || !nome || !nascimento || !telefone || !cpf) {
    return res
      .status(400)
      .json({ mensagem: "Todos os campos são obrigatórios." });
  }

  // Verificar se o email já está cadastrado
  db.get("SELECT * FROM usuarios WHERE email = ?", [email], (err, row) => {
    if (err) {
      return res
        .status(500)
        .json({ mensagem: "Erro ao consultar o banco de dados." });
    }

    if (row) {
      return res.status(400).json({ mensagem: "Email já cadastrado." });
    }

    // Hash da senha para segurança
    bcrypt.hash(senha, 10, (err, hashedSenha) => {
      if (err) {
        return res
          .status(500)
          .json({ mensagem: "Erro ao criptografar a senha." });
      }

      // Inserir o novo usuário no banco de dados
      const stmt = db.prepare(
        "INSERT INTO usuarios (nome, data_nascimento, email, telefone, senha, cpf) VALUES (?, ?, ?, ?, ?, ?)"
      );
      stmt.run(
        [nome, nascimento, email, telefone, hashedSenha, cpf],
        function (err) {
          if (err) {
            return res
              .status(500)
              .json({ mensagem: "Erro ao cadastrar o usuário." });
          }

          // Gerar tokens após o cadastro
          const usuario = { id: this.lastID, nome, email, telefone, cpf };
          const accessToken = GenerateAccessToken(usuario);
          const refreshToken = generateRefreshToken(usuario);

          // Responder com os tokens
          return res.status(200).json({
            mensagem: "Cadastro bem-sucedido",
            accessToken,
            refreshToken,
          });
        }
      );
    });
  });
});

app.post("/token", async (req, res) => {
  const { accessToken, refreshToken } = req.body; // Agora vamos pegar tanto o access token quanto o refresh token

  if (!accessToken) {
    return res.status(400).json({ mensagem: "Token não fornecido" });
  }

  try {
    // Tentativa de verificar o access token
    const user = await VerifyAccessToken(accessToken);
    return res.status(200).json({ mensagem: "Access token válido", user:user});
  } catch (erro) {
    // Se o access token for inválido, tenta verificar o refresh token
    console.log("Access token inválido. Tentando verificar o refresh token...");

    if (!refreshToken) {
      return res.status(400).json({ mensagem: "Refresh token não fornecido" });
    }

    try {
      // Verificar o refresh token
      const userFromRefreshToken = await VerifyRefreshToken(refreshToken);

      // Se o refresh token for válido, gerar um novo access token
      if (userFromRefreshToken) {
        const newAccessToken = GenerateAccessToken(userFromRefreshToken);
        return res
          .status(200)
          .json({
            mensagem: "Novo access token gerado",
            accessToken: newAccessToken,
          });
      } else {
        return res.status(403).json({ mensagem: "Refresh token inválido" });
      }
    } catch (erro) {
      return res
        .status(403)
        .json({ mensagem: "Erro ao verificar o refresh token" });
    }
  }
});

app.post("/tokenGoogle", async (req,res) =>{
  const {tokenID} = req.body
  const client = new OAuth2Client("371489135-rcgaffospvilhdff34dr7fo2ae8f88qd.apps.googleusercontent.com");
  try{
    const ticket = await client.verifyIdToken({
      idToken: tokenID,
      audience: "371489135-rcgaffospvilhdff34dr7fo2ae8f88qd.apps.googleusercontent.com"
    })
    
    return res.status(200).json({user: {nome: ticket.payload.name, email: ticket.payload.email, user_id: "", picture: ticket.payload.picture}})
  } catch(error){
    return res.status(403)
  }
})


app.post("/consulta", async (req,res) =>{
    const { motivo, data, accessToken } = req.body

    try {
        const user = await VerifyAccessToken(accessToken)
        const query = 'INSERT INTO consultas_psicologia (motivo_consulta, data_consulta, user_id) VALUES (?, ?, ?)';
        db.run(query, [motivo, data, user.user_id], (err) => {
            if(err){
                return res.status(500).json({menagem: "Erro ao registrar a consulta"})
            }

            return res.status(201).json({mensagem: 'Consulta registrada com sucesso!'});
        })
    } catch (erro){
        return res.status(400).json({mensagem: 'Token invalido!'});
    }
})

function VerifyAccessToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, result) => {
      if (err) {
        reject("Token Invalido");
      } else {
        resolve(result);
      }
    });
  });
}

function VerifyRefreshToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.REFRESH_TOKEN, (err, result) => {
      if (err) {
        reject("Token Invalido");
      } else {
        resolve(result);
      }
    });
  });
}

function GenerateAccessToken(user) {
  return jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: "15m" });
}
function generateRefreshToken(user) {
  return jwt.sign(user, process.env.REFRESH_TOKEN, { expiresIn: "24h" });
}

// Iniciar o servidor
app.listen(port, process.env.IP,  () => {
  console.log(`Servidor rodando ${process.env.IP} ${port}`);
});

const express = require("express");
const transporter = require('./EmailSender.js'); 
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { OAuth2Client } = require('google-auth-library');
require("dotenv").config();
const app = express();
const cors = require('cors')
const util = require('util');
const port = 3000;

const db = require("./connection");
const dbGet = util.promisify(db.get).bind(db); // transforma db.get em async

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

  const sql = "SELECT * FROM usuarios WHERE email = ?";

  try {
    db.get(sql, [email], (err, row) => {
      if (err) {
        return res.status(400).json({ error: err.message }); // corrigido: err.message, não err.mensagem
      }

      if (!row) {
        return res.status(401).json({ mensagem: "Email ou senha inválidos" }); // <--- ADICIONE O return AQUI
      }

      bcrypt.compare(senha, row.senha, (err, result) => {
        if (err) {
          return res.status(500).json({ mensagem: "Erro ao comparar senha" });
        }

        if (!result) {
          return res.status(401).json({ mensagem: "Email ou senha inválidos" });
        } else {
          const user = {
            nome: row.nome,
            email: row.email,
            user_id: row.user_id,
            telefone: row.telefone,
          };
          const accessToken = GenerateAccessToken(user);
          const refreshToken = generateRefreshToken(user);
          return res.json({ accessToken: accessToken, refreshToken: refreshToken });
        }
      });
    });
  } catch (error) {
    return res.status(500).json({ mensagem: "Erro no servidor" });
  }
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
        "INSERT INTO usuarios (nome, data_nascimento, email, telefone, senha, cpf, codigo_verificacao) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      stmt.run(
        [nome, nascimento, email, telefone, hashedSenha, cpf, null],
        function (err) {
          if (err) {
            return res
              .status(500)
              .json({ mensagem: `Erro ao cadastrar o usuário. ${err}` });
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
    console.log(res)
  } catch(error){
    return res.status(403)
  }
})


app.post("/consulta", async (req,res) =>{
    const { motivo, data, user_id } = req.body

    try {
        const query = 'INSERT INTO consultas_psicologia (motivo_consulta, data_consulta, user_id) VALUES (?, ?, ?)';

        if(!motivo){
          return res.status(500).json({mensagem: "Motivo em branco!"})
        }

        if(!data){
          return res.status(500).json({mensagem: "Escolha uma data disponível!"})
        }

        db.run(query, [motivo, data, user_id], (err) => {
            if(err){
                return res.status(500).json({mensagem: "Erro ao registrar a consulta"})
            }

            return res.status(201).json({mensagem: 'Consulta registrada com sucesso!'});
        })
    } catch (erro){
        return res.status(400).json({mensagem: 'Token invalido!'});
    }
})

app.post('/esqueciSenha/enviarEmail', async (req, res) => {
  const { to } = req.body;
  try {
    const codigo_verificacao = await generateVerifyCode(to)
    const info = await transporter.sendMail({
      from: `"Maternidade Sem Clichê App" <${process.env.GMAIL_USER}>`,
      to: to,
      subject: "Verificação: Troca de senha Maternidade App",
      text: `Seu código de verificação para recuperação de conta:
              ${codigo_verificacao}`
    });

    console.log("Mensagem enviada: %s", info.messageId);
    res.status(200).json(mensagem="E-mail enviado com sucesso via Nodemailer!");

  } catch (error) {
    console.error("Erro ao enviar e-mail:", error);
    res.status(500).json(mensagem="Falha ao enviar e-mail.");
  }
});

app.post('/esqueciSenha/codigoVerificacao', async (req, res) => {
  const { to, code } = req.body;
  try {
    const isValidCode = await VerifyCode(to,code)
    
    if (isValidCode) {
      console.log("Codigo válido");
      cleanVerifyCode(to,code)
      res.status(200).json(mensagem="Codigo válido!");
    }
    else{
      res.status(400).json(mensagem="Codigo não válido");
    }

  } catch (error) {
    console.error("Erro ao verificar codigo:", error);
    res.status(500).json(mensagem="Falha ao verificar codigo.");
  }
});

app.put('/esqueciSenha/redefinirSenha', async (req, res) => {
  const { email, novaSenha } = req.body


  if (!email || !novaSenha) {
    return res.status(400).json({ mensagem: 'Dados incompletos.' });
  }

  try {
    const CleanCode = cleanVerifyCode(email)
    if (CleanCode) {
      const senhaHash = await bcrypt.hash(novaSenha, 10)
      const sql = `UPDATE usuarios SET senha = ? WHERE email = ?`
      db.run(sql, [senhaHash, email], (err) => {
        if (err) {
          return res.status(500).json({mensagem: "Erro ao registrar a consulta"}) 
        }
        
        return res.status(200).json({mensagem: 'Senha atualizada com sucesso!'});
        
      })
    }
  } catch (error) {
    return res.status(500).json({mensagem: 'Erro ao atualizar!'});
  }
})

app.post('/consulta/enviarEmail', async (req, res) => {
  const { to, data } = req.body;

  try {

    const info = await transporter.sendMail({
      from: `"Maternidade Sem Clichê App" <${process.env.GMAIL_USER}>`,
      to: to,
      subject: "Confirmação do sua Consulta: Um tempo para você na sua jornada da maternidade`",
      text: `
Olá,

Sua consulta de acolhimento psicológico está confirmada! Este é um passo muito importante de autocuidado na sua jornada.

Aqui estão os detalhes do nosso encontro:

- Data: ${data}
- Local: A sessão será online, através do link que será enviado 15 minutos antes do nosso horário.
- Com a psicóloga: Letícia Carazzatto

Este será um espaço seguro, confidencial e sem julgamentos, dedicado inteiramente a você e ao seu bem-estar. Para nosso encontro online, sugiro que procure um lugar tranquilo e utilize fones de ouvido para garantir sua privacidade.

Caso precise reagendar ou cancelar, peço que me avise com pelo menos 24 horas de antecedência, para que outra pessoa possa aproveitar o horário.

Estou aqui para te acolher.

Até breve!

Atenciosamente,
Psicóloga Perinatal e da Parentalida`
    });

    console.log("Mensagem enviada: %s", info.messageId);
    res.status(200).json(mensagem="E-mail enviado com sucesso via Nodemailer!");

  } catch (error) {
    console.error("Erro ao enviar e-mail:", error);
    res.status(500).json(mensagem="Falha ao enviar e-mail.");
  }
});

async function cleanVerifyCode(email) {
  const sql = `UPDATE usuarios SET codigo_verificacao = NULL WHERE email = ?`;
  const result = db.run(sql, email);
  if (result.changes === 0) {
    console.warn(`Atenção: Nenhum usuário encontrado com o e-mail: ${email}`);
    throw(Error(` Nenhum usuário encontrado com o e-mail: ${email}`))
  }

    console.log(`Codigo de verificação limpo.`);
    return true
}

async function generateVerifyCode(email){
    const code = Math.floor(10000 + Math.random() * 90000)
    try{
    const sql = `UPDATE usuarios SET codigo_verificacao = ? WHERE email = ?`;
    const result = db.run(sql, [code, email]);
     if (result.changes === 0) {
       console.warn(`Atenção: Nenhum usuário encontrado com o e-mail: ${email}`);
       throw(Error(` Nenhum usuário encontrado com o e-mail: ${email}`))

    }

    console.log(`Código ${code} gerado com sucesso para o e-mail ${email}.`);
  
    return code;

  } catch (error) {
    console.error("Erro ao gerar código de verificação:", error);
    return null;
  } 
}

async function VerifyCode(email, code) {
  if (!email || !code) {
    console.error("E-mail ou código não fornecido.");
    return false;
  }

  try {
    const sql = `SELECT codigo_verificacao FROM usuarios WHERE email = ?`;
    const user = await dbGet(sql, [email]); // agora funciona com await

    if (!user) {
      console.log(`Usuário não encontrado para o e-mail: ${email}`);
      return false;
    }

    console.log("Usuário encontrado:", user);

    const storedCode = String(user.codigo_verificacao);
    const providedCode = String(code);

    if (storedCode === providedCode) {
      console.log(`Código verificado com sucesso para o e-mail: ${email}`);
      return true;
    } else {
      console.log(`Código inválido (${providedCode}) fornecido para o e-mail: ${email}`);
      return false;
    }

  } catch (error) {
    console.error("Erro no processo de verificação de código:", error);
    return false;
  }
}



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

app.use(cors({origin:'*'}))
app.listen(port, process.env.IP,  () => {
  console.log(`Servidor rodando ${process.env.IP} ${port}`);
});

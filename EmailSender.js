const nodemailer = require('nodemailer');
require("dotenv").config();

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", 
  port: 465, 
  secure: true, 
  auth: {
    user: process.env.GMAIL_USER, 
    pass: process.env.GMAIL_APP_PASSWORD, 
  },
});

transporter.verify((error, success) => {
    if (error) {
        console.log("Erro na conexão com o servidor de e-mail:", error);
    } else {
        console.log("Servidor de e-mail conectado e pronto para enviar mensagens.");
    }
});

module.exports = transporter;

// async function SendEmail(){
//      try {
//     // Verifique a conexão com o servidor SMTP
//     await transporter.verify();

//     // Envie o e-mail
//     const info = await transporter.sendMail({
//       from: `"Seu Nome ou App" <${process.env.GMAIL_USER}>`,
//       to: "batistagabriel708@gmail.com",
//       subject: "subject",
//       text: "text",
//       html: `<b>"Ola"</b>`, // Versão em HTML
//     });

//     console.log("Mensagem enviada: %s", info.messageId);
//     // res.status(200).send("E-mail enviado com sucesso via Nodemailer!");

//   } catch (error) {
//     console.error("Erro ao enviar e-mail:", error);
//     // res.status(500).send("Falha ao enviar e-mail.");
//   }
// }

// const SendMail = SendEmail()

// app.post('/send-with-nodemailer', async (req, res) => {
//   const { to, subject, text } = req.body;

//   try {
//     // Verifique a conexão com o servidor SMTP
//     await transporter.verify();

//     // Envie o e-mail
//     const info = await transporter.sendMail({
//       from: `"Seu Nome ou App" <${process.env.GMAIL_USER}>`,
//       to: to,
//       subject: subject,
//       text: text,
//       html: `<b>${text}</b>`, // Versão em HTML
//     });

//     console.log("Mensagem enviada: %s", info.messageId);
//     res.status(200).send("E-mail enviado com sucesso via Nodemailer!");

//   } catch (error) {
//     console.error("Erro ao enviar e-mail:", error);
//     res.status(500).send("Falha ao enviar e-mail.");
//   }
// });
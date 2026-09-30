require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const publicApi = require('./routes/public');
const adminApi = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());

app.use(
  session({
    name: 'barbearia.sid',
    secret: process.env.SESSION_SECRET || 'troque-este-segredo-em-producao',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 12 // 12h
    }
  })
);

app.use('/api/public', publicApi);
app.use('/api/admin', adminApi);

app.use(express.static(path.join(__dirname, '..', 'public')));

// Rotas amigáveis
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});
app.get('/cancelar', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'cancelar.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Barbearia rodando em http://0.0.0.0:${PORT}`);
});

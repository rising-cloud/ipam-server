const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
var port = 40000 || process.env.PORT;


const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

const routes = require('./routes/routes');

mongoose.connect('mongodb://rishi:Password123@ds239412.mlab.com:39412/myipamdb', {
    useNewUrlParser: true
});

mongoose.connection.on('connected', () => {
    console.log('MongoDB Connection Established');
});

mongoose.connection.on('error', (err) => {
    throw err;
});

//specify routes.js
app.use('/api', routes);

//app.use(express.static(path.join(__dirname, 'public')));    //no landing page yet, testing on PostMan

app.listen(port, () => {
    console.log('Server started on port -> ' + port);
});

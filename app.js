'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const admin = require("firebase-admin");
const network = require('network');
const iplocation = require('iplocation')
const rpio = require('rpio');

const app = express()
const verify = process.env.VERIFY_VALUE || 'stub'
const token = process.env.TOKEN_VALUE

admin.initializeApp({
    credential: admin.credential.cert(process.env.PATH_AUTH),
    databaseURL: "https://fiap-iot-bot.firebaseio.com"
});

app.set('port', (process.env.PORT || 5000))

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())


app.get('/', function (req, res) {
    res.send('Hi, I am a bot!')
})

app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === verify) {
        return res.send(req.query['hub.challenge'])
    }

    res.send('Error, wrong token')
})


app.post('/webhook/', function (req, res) {
  const messagingEvents = req.body.entry[0].messaging || []

  console.log(messagingEvents);

  async.map(messagesingEvents, iterator, (err, result) => {
    if (err) {
      return res.sendStatus(400);
    }

    return res.sendStatus(200);
  })

  function iterator (event, callback) {
    const sender = event.sender.id
    const message = event.message && event.message.text
    const text = '';
    const databaseText = message;
    const possibleStates = {
      turnon: function () {
        rpio.open(12, rpio.OUTPUT, rpio.LOW);
        rpio.write(12, rpio.high);
        text = "Turning on the light 💡💡"
      },
      turnoff: function () {
        rpio.write(12, rpio.high);
        text = "Turning off the lights 🔌"
      }
    }
    const state = possibleStates[message];

    if (!possibleStates[message]) {
      text = `${message.substring(0, 200)} ... hmm, I am only prepared to turnon or turnoff!`
      databaseText = 'invalid'
    } else {
      possibleStates[message]()
    }

    const tasks = {
      message: async.apply(sendTextMessage, sender, text),
      database: async.apply(sendToDB, sender, databaseText)
    };

    async.parallel(tasks, (err) => {
      if (err) {
        return callback(err);
      }

      return callback();
    });
  }
})


function sendTextMessage(sender, text, callback) {
    const messageData = { text: text }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: token },
        method: 'POST',
        json: {
            recipient: { id: sender },
            message: messageData,
        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
          return callback(err);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
          return callback(response.body.error);
        }
    })
}

function sendToDB(sender, text, callback) {
    const db = admin.database();
    const ref = db.ref("server/message");
    const msgRef = ref.child("msg");

    async.waterfall([
      (cb) => network.get_public_ip(cb),
      (ip, cb) => iplocation(ip, cb)
    ], (err, res) => {
      if (err) {
        return callback(err);
      }

      const req = {
        recipient: { id: sender },
        message: text,
        timestamp: Math.round(Date.now() / 1000),
        location: {
          latitude: res.latitude,
          longitude: res.longitude
        },
      };

      msgRef.push().set(req);

      return callback()
    });
}

app.listen(app.get('port'), function () {
    console.log('running on port', app.get('port'))
})

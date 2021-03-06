var express = require('express');
var flash = require('connect-flash');
var util = require('util');
var sts = require('strict-transport-security');

var storage = require('./storage.js').storage;
var logger = require('./logger.js').logger;
var force_https = require('./force-https.js').create();
var nodemailer = require("nodemailer");
var smtpTransport = nodemailer.createTransport("SMTP", {
  service : "Gmail",
  auth : {
    user : process.env.EMAIL_ADDRESS || "palabra@erdtman.se",
    pass : process.env.EMAIL_PASSWORD || "lapa123!"
  }
});

var app = express();
var port = process.env.PORT || 5001;

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('keyboard cat'));
  app.use(express.session());
  app.use(flash());
  app.use(force_https);
  app.use(sts.getSTS({
    "max-age" : {
      days : 30
    }
  }));
  app.use(app.router);
  app.use("/static", express.static(__dirname + '/static'));
  app.use(express.errorHandler({
    showStack : false,
    dumpExceptions : false
  }));
});

app.get('/clear', function(req, res) {
  storage.dropDatabase(function() {
    res.send("clean");
  });
});

app.get('/listusers', function(req, res) {
  storage.findAllUsersBy({}, function(error, users) {
    res.json(users);
  });
});

app.get('/', function(req, res) {
  res.render('start.jade', {
    flash : req.flash()
  });
});

app.post('/create', function(req, res) {
  console.log("Create" + req.body.email);
  storage.findOneUserBy({
    email : req.body.email.toLowerCase()
  }, function(error, user) {
    if (user) {
      console.log("User found");
      smtpTransport.sendMail({
        from : "La palabra del día <palabra@erdtman.se>",
        to : user.email,
        subject : "Account",
        text : util.format("Welcome to La palabra del día this is your account link http://lapalabradeldia.herokuapp.com/%s", user._id)
      }, function(error, response) {
        if (error) {
          console.log(error);
          req.flash("error", "Failed to send email.");
        } else {
          console.log("Message sent: " + response.message);
          req.flash("info", "An email has been sent with a link to the account.");
        }
        return res.redirect("/");
      });
    } else {
      console.log("User not found");
      storage.saveUser({
        email : req.body.email.toLowerCase(),
        created : new Date()
      }, function(error, user) {
        smtpTransport.sendMail({
          from : "La palabra del día <palabra@erdtman.se>",
          to : user.email,
          subject : "Account",
          text : util.format("Open your account by clicking this link, http://palabra.herokuapp.com/%s", user._id)
        }, function(error, response) {
          if (error) {
            console.log(error);
          } else {
            console.log("Message sent: " + response.message);
          }
        });
        req.flash("success", "Account created, en email has been sent with a link to your account for later use");
        res.redirect("/" + user._id);
      });
    }
  });

});

var setupUser = function(req, res, next) {
  if (req.params.id == "static") {
    return next();
  }
  storage.findOneUserBy({
    _id : req.params.id
  }, function(error, user) {
    if (!user) {
      req.flash("error", "Unkonwn account!");
      return res.redirect("/");
    }
    req.user = user;
    res.locals.user = user;
    return next();
  });
};

app.get('/:id', setupUser);
app.get('/:id/*', setupUser);
app.post('/:id/*', setupUser);

app.get('/:id', function(req, res) {
  storage.countWordsBy({
    owner : req.user._id,
    tests : {
      $lte : 16
    }
  }, function(unknown_words) {
    storage.countWordsBy({
      owner : req.user._id,
      tests : {
        $gt : 16
      }
    }, function(known_words) {
      res.render('start_internal.jade', {
        user : req.user,
        flash : req.flash(),
        known_words : known_words,
        unknown_words : unknown_words
      });
    });
  });
});

app.get('/:id/add', function(req, res) {
  res.render('add_word.jade', {
    user : req.user,
    flash : req.flash()
  });
});

app.post('/:id/add', function(req, res) {
  storage.saveWord({
    word : req.body.word.toLowerCase(),
    translation : req.body.translation.toLowerCase(),
    owner : req.user._id,
    created : new Date,
    tests : 0,
    failed_tests : 0
  }, function(error, word) {
    console.log(word);
    req.flash("success", "'" + word[0].word + "' has been added");
    res.redirect("/" + req.params.id + "/add");
  });
});

app.get('/:id/unknown', function(req, res) {
  storage.findAllWordsBy({
    owner : req.user._id,
    tests : {
      $lte : 16
    }
  }, function(error, words) {
    console.log("words: %j", words);
    res.render('list_unknown_words.jade', {
      user : req.user,
      words : words,
      flash : req.flash()
    });
  });
});

app.get('/:id/known', function(req, res) {
  storage.findAllWordsBy({
    owner : req.user._id,
    tests : {
      $gt : 16
    }
  }, function(error, words) {
    console.log("known words: %j", words);
    res.render('list_known.jade', {
      user : req.user,
      words : words,
      flash : req.flash()
    });
  });
});

app.get('/:id/settings', function(req, res) {
  res.render('settings.jade', {
    user : req.user,
    flash : req.flash()
  });
});

app.post('/:id/settings', function(req, res) {
  var user = req.user;
  user.email = req.body.email.toLowerCase();
  user.pushover_id = req.body.pushover_id;
  user.words_per_day = parseInt(req.body.words_per_day);
  console.log(user);
  storage.updateUser(user, function(error, updatedUser) {
    req.flash("success", "Settigs has been saved!");
    return res.redirect("/" + user._id + "/settings");
  });
});

app.post('/:id/delete/:word_id', function(req, res) {
  storage.deleteWord({
    _id : req.params.word_id,
    owner : req.params.id
  }, function(error, deltedWord) {
    req.flash("success", "Word has been deleted.");
    return res.redirect(req.headers.referer ? req.headers.referer : "/" + req.user._id);
  });
});

app.get('/:id/badge', function(req, res) {
  storage.countWordsBy({
    owner : req.user._id,
    tests : {
      $lte : 16
    }
  }, function(unknown_words) {
    res.header("Content-Type", "application/xml");
    res.send(util.format('<?xml version="1.0" encoding="utf-8" ?>\n<badge value="%d"/>', unknown_words));
  });
});

app.get('/:id/training', function(req, res) {
  function getWord(user, callback) {
    storage.findAllWordsBy({
      owner : user._id,
      tests : {
        $lte : 16
      }
    }, function(error, words) {
      if (words.lenght === 0) {
        console.log("found no words");
        return callback(1);
      }
      var index = Math.floor(Math.random() * words.length);
      var word = words[index];
      console.log("Returning word: %j", word);
      callback(null, word);
    });
  }

  getWord(req.user, function(error, word) {
    res.redirect("/" + req.user._id + "/" + word._id + "?training=true");
  });
});

app.get('/:id/:word_id', function(req, res) {
  storage.findOneWordBy({
    _id : req.params.word_id,
    owner : req.params.id
  }, function(error, word) {
    console.log(word);
    res.render('question.jade', {
      user : req.user,
      word : word,
      flash : req.flash()
    });
  });
});

app.post('/:id/:word_id', function(req, res) {
  storage.findOneWordBy({
    _id : req.params.word_id,
    owner : req.params.id
  }, function(error, word) {
    var correct = function(translation, guess) {
      var translations = translation.split(",");
      for ( var i = 0; i < translations.length; i++) {
        if (translations[i].trim() === guess.trim()) {
          return true;
        }
      }
      return false;
    };

    var isCorrect = correct(word.translation, req.body.translation.toLowerCase());

    if (isCorrect) {
      word.tests++;
    } else if (word.failed_tests) {
      word.failed_tests++;
    } else {
      word.failed_tests = 1;
    }

    storage.updateWord(word, function(error, updatedWord) {
      res.render('answer.jade', {
        user : req.user,
        word : word,
        sugestion : req.body.translation.toLowerCase(),
        correct : isCorrect,
        flash : req.flash(),
        training : req.query.training
      });
    });
  });
});

var server = app.listen(port, function() {
  logger.info("Listening on %d", port);
});

var mongo = require('mongodb');
var ObjectID = require('mongodb').ObjectID;
var logger = require("./logger.js").logger;

StorageProvider = function(url) {
  var that = this;
  logger.info("Setting up database connection to '%s'", url);
  mongo.connect(url, {}, function(error, db) {
    if (error) {
      logger.error("Failed to connect to database, %s", error);
      return;
    } else {
      logger.info("Connection to database established");

    }
    that.db = db;
    that.db.addListener("error", function(error) {
      console.log(error);
      logger.error("Database error, %j", error);
    });
  });
};

StorageProvider.prototype.getCollection = function(type, callback) {
  this.db.collection(type, function(error, collection) {
    if (error) {
      callback(error);
    } else {
      callback(null, collection);
    }
  });
};

/**
 * Find one by
 */
StorageProvider.prototype.findOneBy = function(type, querie, callback) {
  this.getCollection(type, function(error, collection) {
    if (error) {
      callback(error);
    } else {
      collection.findOne(querie, function(error, result) {
        if (error) {
          callback(error);
        } else {
          callback(null, result);
        }
      });
    }
  });
};

StorageProvider.prototype.findOneWordBy = function(querie, callback) {
  this.findOneBy("words", querie, callback);
};

StorageProvider.prototype.findOneUserBy = function(querie, callback) {
  this.findOneBy("wordusers", querie, callback);
};

/**
 * Find all by
 */
StorageProvider.prototype.findAllBy = function(type, query, callback, limit, sort) {
  this.getCollection(type, function(error, collection) {
    if (error) {
      callback(error);
    } else {
      var result = collection.find(query);
      if (sort) {
        result.sort(sort);
      }
      if (limit) {
        result.limit(limit);
      }
      result.toArray(function(error, result) {
        if (error) {
          callback(error);
        } else {
          callback(null, result);
        }
      });
    }
  });
};

StorageProvider.prototype.findAllWordsBy = function(query, callback, limit, sort) {
  this.findAllBy("words", query, callback, limit, sort);
};

StorageProvider.prototype.findAllUsersBy = function(query, callback, limit) {
  this.findAllBy("wordusers", query, callback, limit);
};

/**
 * Save
 */
StorageProvider.prototype.save = function(type, data, callback) {
  this.getCollection(type, function(error, collection) {
    if (error) {
      callback(error);
    } else {
      collection.insert(data, function(error) {
        callback(null, data);
      });
    }
  });
};

StorageProvider.prototype.saveWord = function(word, callback) {
  this.save("words", word, callback);
};

StorageProvider.prototype.saveUser = function(user, callback) {
  this.save("wordusers", user, callback);
};

/**
 * Delete
 */
StorageProvider.prototype.deleteOne = function(type, data, callback) {
  this.getCollection(type, function(error, collection) {
    if (error) {
      callback(error);
    } else {
      collection.remove(data, function(error, status) {
        if (error) {
          callback(error);
        } else {
          callback();
        }
      });
    }
  });
};

StorageProvider.prototype.deleteWord = function(word, callback) {
  this.deleteOne("words", word, callback);
};

StorageProvider.prototype.deleteUser = function(user, callback) {
  this.deleteOne("wordusers", user, callback);
};

/**
 * Update
 */

StorageProvider.prototype.updateWord = function(word, callback) {
  this.getCollection("words", function(error, collection) {
    if (error) {
      callback(error);
    } else {
      collection.update({
        _id : word._id
      }, word, {
        upsert : true,
        w : 1
      }, function(error, updatedDevice) {
        callback(error, updatedDevice);
      });
    }
  });
};

StorageProvider.prototype.updateUser = function(user, callback) {
  this.getCollection("wordusers", function(error, collection) {
    if (error) {
      callback(error);
    } else {
      collection.update({
        _id : user._id
      }, user, {
        upsert : true,
        w : 1
      }, function(error, newUser) {
        if (error) {
          callback(error);
        } else {
          callback(null, newUser);
        }
      });
    }
  });
};

/**
 * Drop
 */
StorageProvider.prototype.dropCollection = function(type, callback) {
  this.getCollection(type, function(error, collection) {
    if (error) {

    } else {
      collection.remove({}, function(err, removed) {
        callback();
      });
    }
  });
};

StorageProvider.prototype.dropDatabase = function(callback) {
  var latch = function(calls, theCallback) {
    var counter = 0;
    return function() {
      counter++;
      if (counter <= 3) {
        theCallback();
      }
    };
  }(5, callback);

  this.dropCollection("words", latch);
  this.dropCollection("wordusers", latch);
};

var mongoUri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/mydb';
exports.storage = new StorageProvider(mongoUri);

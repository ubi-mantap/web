'use strict';

const async = require('async');
const request = require('request');
const logger = require('../libs/logger');

module.exports = function factory(models) {
  return function log(req, res) {
    logger.debug('[Log Handler] Got request.', req.body);

    const WEATHER_API_KEY = '79a4f0e5d011f84644fee1cecc5e03ae';
    const username = req.body.username;
    const lat = req.body.lat;
    const long = req.body.long;

    let weatherAndCity, distance;

    async.parallel([
      fetchWeatherAndCity,
      calculateDistance
    ], (err, results) => {
      if (err) {
        logger.error('[Log Handler] Error on external API calls.', err);
        return res.json({ ok: false, message: 'Error on external API calls.' });
      }

      logger.debug('[Log Handler] External API calls success.', results);
      weatherAndCity = results[0];
      distance = results[1];

      async.parallel([
        createPosition,
        createNotification
      ], (error) => {
        if (error) {
          logger.error('[Log Handler] Error on inserting to database.', error);
          return res.json({ ok: false, message: 'Error on inserting to database.' });
        }

        logger.debug('[Log Handler] Inserting to database success.');
        res.json({ ok: true });
      });
    });

    function fetchWeatherAndCity(callback) {
      logger.debug('[Log Handler] Fetching weather and city...');
      const weatherApiUrl = `http://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${long}&appid=${WEATHER_API_KEY}`;
      request(weatherApiUrl, (err, response, body) => {
        if (err) {
          logger.error('[Log Handler] Error fetching weather and city.', err);
          return callback(err);
        }

        logger.debug('[Log Handler] Fetching weather and city success.');
        const weatherData = JSON.parse(body);
        callback(null, {
          weather: weatherData.weather[0].main,
          city: weatherData.name
        });
      });
    }

    function calculateDistance(callback) {
      logger.debug('[Log Handler] Calculating distance...');

      // TODO: implement
      distance = 0;

      logger.debug('[Log Handler] Calculating distance success.');
      callback(null, distance);
    }

    function createPosition(callback) {
      models.Position.new({ username, lat, long, name: weatherAndCity.city, weather: weatherAndCity.weather })
        .then(() => {
          logger.debug('[Log Handler] Create position success.');
          callback();
        })
        .catch(err => {
          logger.error('[Log Handler] Create position failed.', err);
          callback(err);
        });
    }

    function createNotification(callback) {
      models.Tracking.findTrackers(username)
        .then(result => {
          result.forEach(tracker => {
            const notification = {
              username: tracker.username,
              type: 'update',
              message: `Update: ${username} is on ${weatherAndCity.city} (${weatherAndCity.weather}).`,
              data: {}
            };

            models.Notification.new(notification)
              .catch(err => {
                logger.error(`[Log Handler] Create notification for ${tracker.username} failed.`, err);
              });
          });

          callback();
        })
        .catch(err => {
          logger.error('[Log Handler] Error on creating notifications');
          callback(err);
        });
    }
  };
};

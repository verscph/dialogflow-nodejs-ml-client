/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const functions = require('firebase-functions');
const {
  WebhookClient,
  Payload,
} = require('dialogflow-fulfillment');

const {
  SimpleResponse,
  Suggestions,
} = require('actions-on-google');

//const util = require('util');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({
    request,
    response
  });

  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  /**
   * Get the translation of the response
   * @param {Array<ResponseElement>} key List of ResponseElement
   * @param {int} n Index of the ResponseElement to be returned
   * @return {string}
   */
  function get_translation(key, n = 0) {
    let locale = agent.locale.slice(0, 2);
    let translations = key.find(translations => translations.locale == locale);
    // Fetch a random translation when more than one translation exists and no specific index has been passed
    if (n === 0) {
      n = Math.floor(Math.random() * translations.msg.length);
    }
    if ((n < translations.msg.length) && (typeof translations != 'undefined')) {
      return (translations.msg[n]);
    } else {
      return ('Error: Translation number ' + String(n) + ' could not be found for locale ' + locale);
    }
  }

  /**
   * Send a simple response
   * @param {string} message Response string
   * @return {DialogflowConversation}
   */
  function simple_response(message) {
    // Reset fallback context parameter
    agent.setContext({
      name: 'helpercontext',
      lifespan: 4,
      parameters: {
        fallbackCount: 0
      }
    });

    let translation = get_translation(message);

    if (agent.requestSource === agent.ACTIONS_ON_GOOGLE) {
      let conv = agent.conv(); // Get Actions on Google library conversation object
      conv.ask(translation); // Use Actions on Google library to add responses
      agent.add(conv);
    } else {
      agent.add(translation);
    }
  }

  /**
   * Handle fallback intents
   * @param {WebhookClient} agent DialogflowWebhookClient
   * @return {DialogflowConversation}
   */
  function generalFallback(agent) {
    const maxFallback = 3;
    const GENERAL_FALLBACK = require('./responses/general_fallback.json');
    const FINAL_FALLBACK = require('./responses/final_fallback.json');

    let fallbackCount = parseInt(agent.getContext('helpercontext').parameters['fallbackCount'], 10);

    if (fallbackCount >= maxFallback) {
      // Close the communication for Google Assistant conversations
      if (agent.requestSource === agent.ACTIONS_ON_GOOGLE) {
        const googlePayloadJson = {
          "expectUserResponse": false,
          "richResponse": {
            "items": [{
              "simpleResponse": {
                "textToSpeech": get_translation(FINAL_FALLBACK),
                "text": get_translation(FINAL_FALLBACK)
              }
            }]
          }
        };
        let payload = new Payload(agent.ACTIONS_ON_GOOGLE, {});
        payload.setPayload(googlePayloadJson);
        agent.add(payload);
      } else {
        simple_response(FINAL_FALLBACK);
      }
    } else {
      agent.add(get_translation(GENERAL_FALLBACK, fallbackCount));
      agent.setContext({
        name: 'helpercontext',
        lifespan: 4,
        parameters: {
          fallbackCount: ++fallbackCount
        }
      });
    }
  }

  let intentMap = new Map(); // Map functions to Dialogflow intent names
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);

  agent.handleRequest(intentMap);

  // Intent handlers
  function welcome(agent) {
    const WELCOME = require('./responses/welcome.json');

    simple_response(WELCOME);
  }

  function fallback(agent) {
    generalFallback(agent);
  }

});

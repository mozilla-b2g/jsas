/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function (root, factory) {
  if (typeof exports === 'object')
    module.exports = factory(require('wbxml'), require('activesync/codepages'));
  else if (typeof define === 'function' && define.amd)
    define(['wbxml', 'activesync/codepages'], factory);
  else
    root.ActiveSyncProtocol = factory(WBXML, ActiveSyncCodepages);
}(this, function(WBXML, ASCP) {
  'use strict';

  const __exports__ = ['VersionInt', 'Connection', 'AutodiscoverError',
                       'AutodiscoverDomainError'];

  function AutodiscoverError(message) {
      this.name = 'ActiveSync.AutodiscoverError';
      this.message = message || '';
  }
  AutodiscoverError.prototype = new Error();
  AutodiscoverError.prototype.constructor = AutodiscoverError;

  function AutodiscoverDomainError(message) {
      this.name = 'ActiveSync.AutodiscoverDomainError';
      this.message = message || '';
  }
  AutodiscoverDomainError.prototype = new AutodiscoverError();
  AutodiscoverDomainError.prototype.constructor = AutodiscoverDomainError;

  function nsResolver(prefix) {
    const baseUrl = 'http://schemas.microsoft.com/exchange/autodiscover/';
    const ns = {
      rq: baseUrl + 'mobilesync/requestschema/2006',
      ad: baseUrl + 'responseschema/2006',
      ms: baseUrl + 'mobilesync/responseschema/2006',
    };
    return ns[prefix] || null;
  }

  function VersionInt(str) {
    let [major, minor] = str.split('.').map(function(x) {
      return parseInt(x);
    });
    return (major << 16) + minor;
  }

  function Connection(aEmail, aPassword, aDeviceId, aDeviceType) {
    this._email = aEmail;
    this._password = aPassword;
    this._deviceId = aDeviceId || 'v140Device';
    this._deviceType = aDeviceType || 'SmartPhone';
    this.connected = false;
  }

  Connection.prototype = {
    get currentVersionInt() { return VersionInt(this.currentVersion); },

    _getAuth: function() {
      return 'Basic ' + btoa(this._email + ':' + this._password);
    },

    autodiscover: function(aCallback, aNoRedirect) {
      let domain = this._email.substring(this._email.indexOf('@') + 1);

      this._autodiscover(domain, aNoRedirect, (function(aStatus, aConfig) {
        if (aStatus instanceof AutodiscoverDomainError)
          this._autodiscover('autodiscover.' + domain, aNoRedirect, aCallback);
        else
          aCallback(aStatus);
      }).bind(this));
    },

    _autodiscover: function(aHost, aNoRedirect, aCallback) {
      // TODO: we need to be smarter here and do some stuff with redirects and
      // other fun stuff, but this works for hotmail, so yay.

      let conn = this;

      let xhr = new XMLHttpRequest({mozSystem: true});
      xhr.open('POST', 'https://' + aHost + '/autodiscover/autodiscover.xml',
               true);
      xhr.setRequestHeader('Content-Type', 'text/xml');
      xhr.setRequestHeader('Authorization', this._getAuth());

      xhr.onload = function() {
        let doc = new DOMParser().parseFromString(xhr.responseText, 'text/xml');

        function getNode(xpath, rel) {
          return doc.evaluate(xpath, rel, nsResolver,
                              XPathResult.FIRST_ORDERED_NODE_TYPE, null)
                    .singleNodeValue;
        }
        function getString(xpath, rel) {
          return doc.evaluate(xpath, rel, nsResolver, XPathResult.STRING_TYPE,
                              null).stringValue;
        }

        if (doc.documentElement.tagName === 'parsererror')
          return aCallback(new AutodiscoverDomainError(
            'Error parsing autodiscover response'));

        let responseNode = getNode('/ad:Autodiscover/ms:Response', doc);
        if (!responseNode)
          return aCallback(new AutodiscoverDomainError(
            'Missing Autodiscover Response node'));

        let error = getNode('ms:Error', responseNode) ||
                    getNode('ms:Action/ms:Error', responseNode);
        if (error)
          return aCallback(new AutodiscoverError(
            getString('ms:Message/text()', error)));

        let redirect = getNode('ms:Action/ms:Redirect', responseNode);
        if (redirect) {
          if (aNoRedirect)
            return aCallback(new AutodiscoverError(
              'Multiple redirects occurred during autodiscovery'));

          conn._email = getString('text()', redirect);
          return conn.autodiscover(aCallback, true);
        }

        let user = getNode('ms:User', responseNode);
        let server = getNode('ms:Action/ms:Settings/ms:Server', responseNode);

        conn.config = {
          'user': {
            'name':  getString('ms:DisplayName/text()',  user),
            'email': getString('ms:EMailAddress/text()', user),
          },
          'server': {
            'type': getString('ms:Type/text()', server),
            'url':  getString('ms:Url/text()',  server),
            'name': getString('ms:Name/text()', server),
          }
        };

        conn.baseURL = conn.config.server.url + '/Microsoft-Server-ActiveSync';
        conn.options(conn.baseURL, function(aStatus, aResult) {
          conn.connected = true;
          conn.currentVersion = aResult.versions.slice(-1)[0];
          conn.config.options = aResult;

          if (aCallback)
            aCallback(null, conn.config);
        });
      };

      // TODO: use something like
      // http://ejohn.org/blog/javascript-micro-templating/ here?
      let postdata =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<Autodiscover xmlns="' + nsResolver('rq') + '">\n' +
      '  <Request>\n' +
      '    <EMailAddress>' + this._email + '</EMailAddress>\n' +
      '    <AcceptableResponseSchema>' + nsResolver('ms') +
           '</AcceptableResponseSchema>\n' +
      '  </Request>\n' +
      '</Autodiscover>';

      xhr.send(postdata);
    },

    options: function(aURL, aCallback) {
      let xhr = new XMLHttpRequest({mozSystem: true});
      xhr.open('OPTIONS', aURL, true);
      xhr.onload = function() {
        // TODO: handle error codes
        let result = {
          'versions': xhr.getResponseHeader('MS-ASProtocolVersions').split(','),
          'commands': xhr.getResponseHeader('MS-ASProtocolCommands').split(','),
        };
        aCallback(null, result);
      };

      xhr.send();
    },

    doCommand: function(aXml, aCallback) {
      if (this.connected) {
        this._doCommandReal(aXml, aCallback);
      }
      else {
        this.autodiscover((function (aStatus, aConfig) {
          if (aStatus) {
            console.log(aStatus);
            aCallback(aStatus);
          }
          else {
            this._doCommandReal(aXml, aCallback);
          }
        }).bind(this));
      }
    },

    _doCommandReal: function(aXml, aCallback) {
      let r = new WBXML.Reader(aXml, ASCP);
      let commandName = r.document.next().localTagName;
      if (this.config.options.commands.indexOf(commandName) === -1) {
        // TODO: do something here!
        let error = new Error("This server doesn't support the command " +
                              commandName);
        console.log(error);
        aCallback(error);
        return;
      }

      let xhr = new XMLHttpRequest({mozSystem: true});
      xhr.open('POST', this.baseURL +
               '?Cmd='        + encodeURIComponent(commandName) +
               '&User='       + encodeURIComponent(this._email) +
               '&DeviceId='   + encodeURIComponent(this._deviceId) +
               '&DeviceType=' + encodeURIComponent(this._deviceType),
               true);
      xhr.setRequestHeader('MS-ASProtocolVersion', this.currentVersion);
      xhr.setRequestHeader('Content-Type', 'application/vnd.ms-sync.wbxml');
      xhr.setRequestHeader('Authorization', this._getAuth());

      let conn = this;
      xhr.onload = function() {
        if (xhr.status == 451) {
          conn.baseURL = xhr.getResponseHeader('X-MS-Location');
          conn.doCommand(aXml, aCallback);
          return;
        }

        if (xhr.status != 200) {
          // TODO: do something here!
          let error = new Error('ActiveSync command returned failure ' +
                                'response ' + xhr.status);
          console.log(error);
          aCallback(error);
          return;
        }

        let response = null;
        if (xhr.response.byteLength > 0)
          response = new WBXML.Reader(new Uint8Array(xhr.response), ASCP);
        aCallback(null, response);
      };

      xhr.responseType = 'arraybuffer';
      xhr.send(aXml.buffer);
    },
  };

  let exported = {};
  for (let [,exp] in Iterator(__exports__))
    exported[exp] = eval(exp);
  return exported;
}));

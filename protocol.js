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

  const __exports__ = ['Version', 'Connection', 'AutodiscoverError',
                       'AutodiscoverDomainError'];

  function nullCallback() {}

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

  function Version(str) {
    [this.major, this.minor] = str.split('.').map(function(x) {
      return parseInt(x);
    });
  }
  Version.prototype = {
    eq: function(other) {
      if (!(other instanceof Version))
        other = new Version(other);
      return this.major === other.major && this.minor === other.minor;
    },
    ne: function(other) {
      return !this.eq(other);
    },
    gt: function(other) {
      if (!(other instanceof Version))
        other = new Version(other);
      return this.major > other.major ||
             (this.major === other.major && this.minor > other.minor);
    },
    gte: function(other) {
      if (!(other instanceof Version))
        other = new Version(other);
      return this.major >= other.major ||
             (this.major === other.major && this.minor >= other.minor);
    },
    lt: function(other) {
      return !this.gte(other);
    },
    lte: function(other) {
      return !this.gt(other);
    },
    toString: function() {
      return this.major + '.' + this.minor;
    },
  };

  /**
   * Create a new ActiveSync connection.
   *
   * @param aEmail the user's email address
   * @param aPassword the user's password
   * @param aDeviceId (optional) a string identifying this device
   * @param aDeviceType (optional) a string identifying the type of this device
   */
  function Connection(aEmail, aPassword, aDeviceId, aDeviceType) {
    this._email = aEmail;
    this._password = aPassword;
    this._deviceId = aDeviceId || 'v140Device';
    this._deviceType = aDeviceType || 'SmartPhone';
    this._connection = 0;
    this._connectionCallbacks = [];
  }

  Connection.prototype = {
    _getAuth: function() {
      return 'Basic ' + btoa(this._email + ':' + this._password);
    },

    _doCallbacks: function() {
      for (let [,callback] in Iterator(this._connectionCallbacks))
        callback.apply(callback, arguments);
      this._connectionCallbacks = [];
    },

    get connected() {
      return this._connection === 4;
    },

    /**
     * Perform autodiscovery and get the options for the server associated with
     * this account.
     *
     * @param aCallback a callback taking an error status (if any), and the
     *        resulting config options.
     */
    connect: function(aCallback) {
      let conn = this;
      if (aCallback && conn._connection !== 4)
        this._connectionCallbacks.push(aCallback);

      if (conn._connection === 0) {
        conn._connection = 1;
        conn.autodiscover(function (aError, aConfig) {
          if (aError) {
            conn._connection = 0;
            return conn._doCallbacks(aError, null);
          }

          conn._connection = 2;
          conn.config = aConfig;
          conn.baseURL = conn.config.server.url +
            '/Microsoft-Server-ActiveSync';
          conn.connect();
        });
      }
      else if (conn._connection === 2) {
        conn._connection = 3;
        conn.options(conn.baseURL, function(aError, aResult) {
          if (aError) {
            conn._connection = 2;
          }
          else {
            conn._connection = 4;
            conn.currentVersion = new Version(aResult.versions.slice(-1)[0]);
            conn.config.options = aResult;
          }

          conn._doCallbacks(aError, conn.config);
        });
      }
      else if (conn._connection === 4) {
        if (aCallback)
          aCallback(null, this.config);
      }
    },

    /**
     * Perform autodiscovery for the server associated with this account.
     *
     * @param aCallback a callback taking an error status (if any)
     * @param aNoRedirect true if autodiscovery should *not* follow any
     *        specified redirects (typically used when autodiscover has already
     *        told us about a redirect)
     */
    autodiscover: function(aCallback, aNoRedirect) {
      if (!aCallback) aCallback = nullCallback;
      let domain = this._email.substring(this._email.indexOf('@') + 1);
      if (domain === 'gmail.com') {
        aCallback(null, this._fillConfig('https://m.google.com'));
        return;
      }

      this._autodiscover(domain, aNoRedirect, (function(aError, aConfig) {
        if (aError instanceof AutodiscoverDomainError)
          this._autodiscover('autodiscover.' + domain, aNoRedirect, aCallback);
        else
          aCallback(aError, aConfig);
      }).bind(this));
    },

    setConfig: function(aConfig) {
      this.config = this._fillConfig(aConfig);
      this.baseURL = this.config.server.url + '/Microsoft-Server-ActiveSync';

      if (this.config.options) {
        this._connection = 4;
        let versionStr = this.config.options.versions.slice(-1)[0];
        this.currentVersion = new Version(versionStr);
      }
      else {
        this._connection = 2;
      }
    },

    _fillConfig: function(aConfig) {
      let config = {
        user: {
          name: '',
          email: this._email,
        },
        server: {
          type: 'MobileSync',
          url: null,
          name: null,
        },
      };

      if (typeof aConfig === 'string') {
        config.server.url = config.server.name = aConfig;
      }
      else {
        let deepCopy = function(src, dest) {
          for (let k in src) {
            if (typeof src[k] === 'object') {
              dest[k] = Array.isArray(src[k]) ? [] : {};
              deepCopy(src[k], dest[k]);
            }
            else {
              dest[k] = src[k];
            }
          }
        };

        deepCopy(aConfig, config);
      }

      return config;
    },

    _autodiscover: function(aHost, aNoRedirect, aCallback) {
      let conn = this;
      if (!aCallback) aCallback = nullCallback;

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

        let config = {
          user: {
            name:  getString('ms:DisplayName/text()',  user),
            email: getString('ms:EMailAddress/text()', user),
          },
          server: {
            type: getString('ms:Type/text()', server),
            url:  getString('ms:Url/text()',  server),
            name: getString('ms:Name/text()', server),
          }
        };

        aCallback(null, config);
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

    /**
     * Get the options for the server associated with this account.
     *
     * @param aCallback a callback taking an error status (if any), and the
     *        resulting options.
     */
    options: function(aURL, aCallback) {
      if (!aCallback) aCallback = nullCallback;
      if (this._connection < 2)
        throw new Error('Must have server info before calling options()');

      let conn = this;
      let xhr = new XMLHttpRequest({mozSystem: true});
      xhr.open('OPTIONS', aURL, true);
      xhr.onload = function() {
        if (xhr.status != 200) {
          aCallback(new Error('Unable to get server options'));
          return;
        }

        let result = {
          'versions': xhr.getResponseHeader('MS-ASProtocolVersions').split(','),
          'commands': xhr.getResponseHeader('MS-ASProtocolCommands').split(','),
        };

        aCallback(null, result);
      };

      xhr.send();
    },

    /**
     * Send a command to the ActiveSync server and listen for the response.
     *
     * @param aCommand the WBXML representing the command or a string/tag
     *        representing the command type for empty commands
     * @param aCallback a callback to call when the server has responded; takes
     *        two arguments: an error status (if any) and the response as a
     *        WBXML reader. If the server returned an empty response, the
     *        response argument is null.
     */
    doCommand: function(aCommand, aCallback) {
      if (!aCallback) aCallback = nullCallback;

      if (this.connected) {
        this._doCommandReal(aCommand, aCallback);
      }
      else {
        this.connect((function(aError, aConfig) {
          if (aError)
            aCallback(aError);
          else {
            this._doCommandReal(aCommand, aCallback);
          }
        }).bind(this));
      }
    },

    _doCommandReal: function(aCommand, aCallback) {
      let commandName;

      if (typeof aCommand === 'string') {
        commandName = aCommand;
      }
      else if (typeof aCommand === 'number') {
        commandName = ASCP.__tagnames__[aCommand];
      }
      else {
        let r = new WBXML.Reader(aCommand, ASCP);
        commandName = r.document.next().localTagName;
      }

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
          conn.doCommand(aCommand, aCallback);
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
      xhr.send(aCommand instanceof WBXML.Writer ? aCommand.buffer : null);
    },
  };

  let exported = {};
  for (let [,exp] in Iterator(__exports__))
    exported[exp] = eval(exp);
  return exported;
}));

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

  var exports = {};

  function nullCallback() {}

  function AutodiscoverError(message) {
    this.name = 'ActiveSync.AutodiscoverError';
    this.message = message || '';
  }
  exports.AutodiscoverError = AutodiscoverError;
  AutodiscoverError.prototype = new Error();
  AutodiscoverError.prototype.constructor = AutodiscoverError;

  function AutodiscoverDomainError(message) {
    this.name = 'ActiveSync.AutodiscoverDomainError';
    this.message = message || '';
  }
  exports.AutodiscoverDomainError = AutodiscoverDomainError;
  AutodiscoverDomainError.prototype = new AutodiscoverError();
  AutodiscoverDomainError.prototype.constructor = AutodiscoverDomainError;

  function HttpError(message, status) {
    this.name = 'ActiveSync.HttpError';
    this.message = message || '';
    this.status = status || 0;
  }
  exports.HttpError = HttpError;
  HttpError.prototype = new Error();
  HttpError.prototype.constructor = HttpError;

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
  exports.Version = Version;
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

  // A mapping from domains to URLs appropriate for passing in to
  // Connection.setServer(). Used for domains that don't support autodiscovery.
  const hardcodedDomains = {
    'gmail.com': 'https://m.google.com',
    'googlemail.com': 'https://m.google.com',
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
    this._waitingForConnection = false;
    this._connectionCallbacks = [];
  }
  exports.Connection = Connection;
  Connection.prototype = {
    /**
     * Get the auth string to add to our XHR's headers.
     *
     * @return the auth string
     */
    _getAuth: function() {
      return 'Basic ' + btoa(this._email + ':' + this._password);
    },

    get _emailDomain() {
      return this._email.substring(this._email.indexOf('@') + 1);
    },

    /**
     * Perform any callbacks added during the connection process.
     *
     * @param aError the error status (if any)
     */
    _notifyConnected: function(aError) {
      if (aError)
        this.disconnect();

      for (let [,callback] in Iterator(this._connectionCallbacks))
        callback.apply(callback, arguments);
      this._connectionCallbacks = [];
    },

    /**
     * Get the connection status.
     *
     * @return true iff we are fully connected to the server
     */
    get connected() {
      return this._connection === 2;
    },

    /**
     * Perform autodiscovery and get the options for the server associated with
     * this account.
     *
     * @param aCallback a callback taking an error status (if any), the
     *        resulting autodiscovery settings, and the server's options.
     */
    connect: function(aCallback) {
      let conn = this;
      if (aCallback) {
        if (conn._connection === 2) {
          aCallback(null, conn.config);
          return;
        }
        conn._connectionCallbacks.push(aCallback);
      }
      if (conn._waitingForConnection)
        return;

      function getAutodiscovery() {
        // Check for hardcoded domains first.
        let domain = conn._emailDomain.toLowerCase();
        if (domain in hardcodedDomains)
          conn.setServer(hardcodedDomains[domain]);

        if (conn._connection === 1) {
          // Pass along minimal configuration info.
          getOptions({ forced: true,
                       selectedServer: { url: conn._forcedServer } });
          return;
        }

        conn._waitingForConnection = true;
        conn.autodiscover(function (aError, aConfig) {
          conn._waitingForConnection = false;

          if (aError)
            return conn._notifyConnected(aError, aConfig);

          // Try to find a MobileSync server from Autodiscovery.
          for (let [,server] in Iterator(aConfig.servers)) {
            if (server.type === 'MobileSync') {
              aConfig.selectedServer = server;
              break;
            }
          }
          if (!aConfig.selectedServer) {
            conn._connection = 0;
            return conn._notifyConnected(
              new AutodiscoverError('No MobileSync server found'), aConfig);
          }

          conn.setServer(aConfig.selectedServer.url);
          getOptions(aConfig);
        });
      }

      function getOptions(aConfig) {
        if (conn._connection === 2)
          return;

        conn._waitingForConnection = true;
        conn.options(function(aError, aOptions) {
          conn._waitingForConnection = false;

          if (aError)
            return conn._notifyConnected(aError, aConfig, aOptions);

          conn._connection = 2;
          conn.versions = aOptions.versions;
          conn.supportedCommands = aOptions.commands;
          conn.currentVersion = new Version(aOptions.versions.slice(-1)[0]);

          if (!conn.supportsCommand('Provision'))
            return conn._notifyConnected(null, aConfig, aOptions);

          conn.provision(function (aError, aResponse) {
            conn._notifyConnected(aError, aConfig, aOptions);
          });
        });
      }

      getAutodiscovery();
    },

    /**
     * Disconnect from the ActiveSync server, and reset all local state.
     */
    disconnect: function() {
      if (this._waitingForConnection)
        throw new Error("Can't disconnect while waiting for server response");

      this._connection = 0;

      this.baseUrl = null;

      this.versions = [];
      this.supportedCommands = [];
      this.currentVersion = null;
    },

    /**
     * Perform autodiscovery for the server associated with this account.
     *
     * @param aCallback a callback taking an error status (if any) and the
     *        server's configuration
     * @param aNoRedirect true if autodiscovery should *not* follow any
     *        specified redirects (typically used when autodiscover has already
     *        told us about a redirect)
     */
    autodiscover: function(aCallback, aNoRedirect) {
      if (!aCallback) aCallback = nullCallback;
      let domain = this._emailDomain;

      // The first time we try autodiscovery, we should try to recover from
      // AutodiscoverDomainErrors. The second time, *all* errors should be
      // reported to the callback.
      this._autodiscover(domain, aNoRedirect, (function(aError, aConfig) {
        if (aError instanceof AutodiscoverDomainError)
          this._autodiscover('autodiscover.' + domain, aNoRedirect, aCallback);
        else
          aCallback(aError, aConfig);
      }).bind(this));
    },

    /**
     * Attempt to provision this account. XXX: Currently, this doesn't actually
     * do anything, but it's useful as a test command for Gmail to ensure that
     * the user entered their password correctly.
     *
     * @param aCallback a callback taking an error status (if any) and the
     *        WBXML response
     */
    provision: function(aCallback) {
      const pv = ASCP.Provision.Tags;
      let w = new WBXML.Writer('1.3', 1, 'UTF-8');
      w.stag(pv.Provision)
        .etag();
      this.doCommand(w, aCallback);
    },

    /**
     * Manually set the server for the connection.
     *
     * @param aConfig a string representing the server URL for commands.
     */
    setServer: function(aServer) {
      this._forcedServer = aServer;
      this.baseUrl = aServer + '/Microsoft-Server-ActiveSync';
      this._connection = 1;
    },

    /**
     * Perform the actual autodiscovery process for a given URL.
     *
     * @param aHost the host name to attempt autodiscovery for
     * @param aNoRedirect true if autodiscovery should *not* follow any
     *        specified redirects (typically used when autodiscover has already
     *        told us about a redirect)
     * @param aCallback a callback taking an error status (if any) and the
     *        server's configuration
     */
    _autodiscover: function(aHost, aNoRedirect, aCallback) {
      let conn = this;
      if (!aCallback) aCallback = nullCallback;

      let xhr = new XMLHttpRequest({mozSystem: true});
      xhr.open('POST', 'https://' + aHost + '/autodiscover/autodiscover.xml',
               true);
      xhr.setRequestHeader('Content-Type', 'text/xml');
      xhr.setRequestHeader('Authorization', this._getAuth());

      xhr.onload = function() {
        if (xhr.status === 401 || xhr.status === 403)
          return aCallback(new HttpError(xhr.statusText, xhr.status));

        let doc = new DOMParser().parseFromString(xhr.responseText, 'text/xml');

        function getNode(xpath, rel) {
          return doc.evaluate(xpath, rel, nsResolver,
                              XPathResult.FIRST_ORDERED_NODE_TYPE, null)
                    .singleNodeValue;
        }
        function getNodes(xpath, rel) {
          return doc.evaluate(xpath, rel, nsResolver,
                              XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
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
        let config = {
          culture: getString('ms:Culture/text()', responseNode),
          user: {
            name:  getString('ms:DisplayName/text()',  user),
            email: getString('ms:EMailAddress/text()', user),
          },
          servers: [],
        };

        let servers = getNodes('ms:Action/ms:Settings/ms:Server', responseNode);
        let server;
        while ((server = servers.iterateNext())) {
          config.servers.push({
            type:       getString('ms:Type/text()',       server),
            url:        getString('ms:Url/text()',        server),
            name:       getString('ms:Name/text()',       server),
            serverData: getString('ms:ServerData/text()', server),
          });
        }

        aCallback(null, config);
      };

      xhr.onerror = function() {
        aCallback(new Error('Error getting Autodiscover URL'));
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
    options: function(aCallback) {
      if (!aCallback) aCallback = nullCallback;
      if (this._connection < 1)
        throw new Error('Must have server info before calling options()');

      let conn = this;
      let xhr = new XMLHttpRequest({mozSystem: true});
      xhr.open('OPTIONS', this.baseUrl, true);

      xhr.onload = function() {
        if (xhr.status !== 200) {
          console.log('ActiveSync options request failed with response ' +
                      xhr.status);
          aCallback(new HttpError(xhr.statusText, xhr.status));
          return;
        }

        let result = {
          versions: xhr.getResponseHeader('MS-ASProtocolVersions').split(','),
          commands: xhr.getResponseHeader('MS-ASProtocolCommands').split(','),
        };

        aCallback(null, result);
      };

      xhr.onerror = function() {
        aCallback(new Error('Error getting OPTIONS URL'));
      };

      xhr.send();
    },

    /**
     * Check if the server supports a particular command. Requires that we be
     * connected to the server already.
     *
     * @param aCommand a string/tag representing the command type
     * @return true iff the command is supported
     */
    supportsCommand: function(aCommand) {
      if (!this.connected)
        throw new Error('Connection required to get command');

      if (typeof aCommand === 'number')
        aCommand = ASCP.__tagnames__[aCommand];
      return this.supportedCommands.indexOf(aCommand) !== -1;
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

    /**
     * Perform the actual process of sending a command to the ActiveSync server
     * and getting the response.
     *
     * @param aCommand the WBXML representing the command or a string/tag
     *        representing the command type for empty commands
     * @param aCallback a callback to call when the server has responded; takes
     *        two arguments: an error status (if any) and the response as a
     *        WBXML reader. If the server returned an empty response, the
     *        response argument is null.
     */
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

      if (!this.supportsCommand(commandName)) {
        let error = new Error("This server doesn't support the command " +
                              commandName);
        console.log(error);
        aCallback(error);
        return;
      }

      let xhr = new XMLHttpRequest({mozSystem: true});
      xhr.open('POST', this.baseUrl +
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
        if (xhr.status === 451) {
          conn.baseUrl = xhr.getResponseHeader('X-MS-Location');
          conn.doCommand(aCommand, aCallback);
          return;
        }

        if (xhr.status !== 200) {
          console.log('ActiveSync command ' + commandName + ' failed with ' +
                      'response ' + xhr.status);
          aCallback(new HttpError(xhr.statusText, xhr.status));
          return;
        }

        let response = null;
        if (xhr.response.byteLength > 0)
          response = new WBXML.Reader(new Uint8Array(xhr.response), ASCP);
        aCallback(null, response);
      };

      xhr.onerror = function() {
        aCallback(new Error('Error getting command URL'));
      };

      xhr.responseType = 'arraybuffer';
      xhr.send(aCommand instanceof WBXML.Writer ? aCommand.buffer : null);
    },
  };

  return exports;
}));

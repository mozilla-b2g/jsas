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

'use strict';

function log(s) {
  let output = document.getElementById('log');
  output.textContent += s;
}

function clearLog() {
  let output = document.getElementById('log');
  output.textContent = '';
}

function logWBXML(data) {
  let outgoing = data instanceof WBXML.Writer;
  let wrapper = new Array(80+1).join(outgoing ? '>' : '<');

  log(wrapper+'\n');
  if (outgoing) {
    log(new WBXML.Reader(data, ActiveSyncCodepages).dump());
  }
  else {
    if (data) {
      log(data.dump());
      data.rewind();
    }
  }
  log(wrapper+'\n\n');
}

const hardcodedServers = {
  'gmail.com':      'https://m.google.com',
  'googlemail.com': 'https://m.google.com',
  'live.com':       'https://m.hotmail.com',
  'outlook.com':    'https://m.hotmail.com',
  'hotmail.es':     'https://m.hotmail.com',
  'aslocalhost':    'http://localhost:8080',
};
function findServer(email, password, callback) {
  let [localPart, domainPart] = email.split('@');

  // Special-case tid.es, since they have funny usernames.
  if (domainPart === 'tid.es') {
    callback(null, { serverUrl: 'https://correo.tid.es',
                     username: 'HI\\' + localPart });
  }
  else if (hardcodedServers.hasOwnProperty(domainPart)) {
    callback(null, { serverUrl: hardcodedServers[domainPart],
                     username: email });
  }
  else {
    ActiveSyncProtocol.autodiscover(email, password, 0,
    function(aError, aConfig) {
      if (aError) {
        callback(aError);
      }
      else {
        let serverUrl = aConfig.mobileSyncServer.url;
        callback(null, {serverUrl: serverUrl,
                        username: email });
      }
    });
  }
}

var account = {
  folders: [],
};

var conn;
window.addEventListener('load', function() {
  findServer(email, password, function(aError, aConfig) {
    if (aError) {
      alert(aError);
      return;
    }

    log('Connecting to ' + aConfig.serverUrl + '...\n');

    conn = new ActiveSyncProtocol.Connection();
    conn.open(aConfig.serverUrl, aConfig.username, password);
    conn.connect(function(aError, aOptions) {
      if (aError) {
        alert(aError);
        return;
      }

      getFolders();
    });
  });
}, false);

function getFolders() {
  const fh = ActiveSyncCodepages.FolderHierarchy.Tags;
  let w = new WBXML.Writer('1.3', 1, 'UTF-8');
  w.stag(fh.FolderSync)
     .tag(fh.SyncKey, '0')
   .etag();
  logWBXML(w);

  conn.postCommand(w, function(aError, aResponse) {
    logWBXML(aResponse);
    if (aError) {
      alert(aError)
      return;
    }

    let foldersNode = document.getElementById('folders');
    let e = new WBXML.EventParser();

    let first = true;
    e.addEventListener([fh.FolderSync, fh.Changes, fh.Add], function(node) {
      let folderData = {};
      for (let [,child] in Iterator(node.children))
        folderData[child.localTagName] = child.children[0].textContent;

      let folder = {
        serverId: folderData.ServerId,
        name: folderData.DisplayName,
      };
      account.folders.push(folder);

      let row = document.createElement('div');
      row.className = 'link';
      row.textContent = folder.name;
      row.addEventListener('click', function() {
        getMessages(folder);
      }, false);
      foldersNode.appendChild(row);

      if (first) {
        first = false;
        getMessages(folder);
      }
    });

    e.run(aResponse);
  });
}

function getSyncKey(folder, callback) {
  const as = ActiveSyncCodepages.AirSync.Tags;

  let w = new WBXML.Writer('1.3', 1, 'UTF-8');
  w.stag(as.Sync)
     .stag(as.Collections)
       .stag(as.Collection)

  if (conn.currentVersion.lt('12.1'))
        w.tag(as.Class, 'Email');

        w.tag(as.SyncKey, '0')
         .tag(as.CollectionId, folder.serverId)
       .etag()
     .etag()
   .etag();
  logWBXML(w);

  conn.postCommand(w, function(aError, aResponse) {
    logWBXML(aResponse);
    if (aError) {
      alert(aError)
      return;
    }

    let e = new WBXML.EventParser();
    e.addEventListener([as.Sync, as.Collections, as.Collection, as.SyncKey],
                       function(node) {
      folder.syncKey = node.children[0].textContent;
    });
    e.run(aResponse);

    callback(folder);
  });
}

function getMessages(folder, getBodies) {
  let messagesNode = document.getElementById('messageList');
  while (messagesNode.lastChild)
    messagesNode.removeChild(messagesNode.lastChild);

  let folderNameNode = document.getElementById('folderName');
  folderNameNode.textContent = folder.name;

  const as = ActiveSyncCodepages.AirSync.Tags;
  const asEnum = ActiveSyncCodepages.AirSync.Enums;
  const asb = ActiveSyncCodepages.AirSyncBase.Tags;
  const asbEnum = ActiveSyncCodepages.AirSyncBase.Enums;
  const em = ActiveSyncCodepages.Email.Tags;

  getSyncKey(folder, function() {
    let w = new WBXML.Writer('1.3', 1, 'UTF-8');
    w.stag(as.Sync)
       .stag(as.Collections)
         .stag(as.Collection)

    if (conn.currentVersion.lt('12.1'))
          w.tag(as.Class, 'Email');

          w.tag(as.SyncKey, folder.syncKey)
           .tag(as.CollectionId, folder.serverId)
           .tag(as.GetChanges)
           .stag(as.Options)

    if (getBodies) {
      if (conn.currentVersion.gte('12.0'))
            w.stag(asb.BodyPreference)
               .tag(asb.Type, asbEnum.Type.PlainText)
             .etag();

            w.tag(as.MIMESupport, asEnum.MIMESupport.Never)
             .tag(as.MIMETruncation, asEnum.MIMETruncation.Truncate100K);
    }
    else if (conn.currentVersion.lte('12.0')) {
            w.tag(as.MIMESupport, asEnum.MIMESupport.Never)
             .tag(as.Truncation, asEnum.MIMETruncation.TruncateAll);
    }

          w.etag()
         .etag()
       .etag()
     .etag();
    logWBXML(w);

    conn.postCommand(w, function(aError, aResponse) {
      logWBXML(aResponse);
      if (aError) {
        alert(aError)
        return;
      }
      if (!aResponse)
        return;

      let e = new WBXML.EventParser();
      e.addEventListener([as.Sync, as.Collections, as.Collection, as.SyncKey],
                         function(node) {
        folder.syncKey = node.children[0].textContent;
      });
      e.addEventListener([as.Sync, as.Collections, as.Collection, as.Commands,
                          as.Add],
                         function(node) {
        let headers = {};

        for (let [,child] in Iterator(node.children)) {
          if (child.tag === as.ServerId) {
            headers.serverId = child.children[0].textContent;
          }
          if (child.tag === as.ApplicationData) {
            for (let [,grandchild] in Iterator(child.children)) {
              let grandchildText = grandchild.children.length &&
                                   grandchild.children[0].textContent;

              if (grandchild.tag === em.Subject)
                headers.subject = grandchildText;
              else if (grandchild.tag === asb.Body) {
                for (let [,greatgrandchild] in Iterator(grandchild.children)) {
                  if (greatgrandchild.tag === asb.Type) {
                    headers.contentType = greatgrandchild.children[0]
                                                         .textContent;
                  }
                }
              }
            }
          }
        }

        let message = document.createElement('div');
        message.className = 'link';
        message.textContent = headers.subject;
        message.addEventListener('click', function() {
          getMessage(folder.serverId, headers.serverId, headers.contentType);
        }, false);
        messagesNode.appendChild(message);
      });

      e.run(aResponse);
    });
  });
}

function getMessage(folderId, messageId, contentType) {
  let messageNode = document.getElementById('message');

  const as = ActiveSyncCodepages.AirSync.Tags;
  const asEnum = ActiveSyncCodepages.AirSync.Enums;
  const asb = ActiveSyncCodepages.AirSyncBase.Tags;
  const asbEnum = ActiveSyncCodepages.AirSyncBase.Enums;
  const em = ActiveSyncCodepages.Email.Tags;
  const io = ActiveSyncCodepages.ItemOperations.Tags;

  let w = new WBXML.Writer('1.3', 1, 'UTF-8');
  w.stag(io.ItemOperations)
     .stag(io.Fetch)
       .tag(io.Store, 'Mailbox')
       .tag(as.CollectionId, folderId)
       .tag(as.ServerId, messageId)
       .stag(io.Options)
         // Only get the AirSyncBase:Body element to minimize bandwidth usage.
         .stag(io.Schema)
           .tag(asb.Body)
         .etag()
         .stag(asb.BodyPreference)
           .tag(asb.Type, contentType)
         .etag()
       .etag()
     .etag()
   .etag();
  logWBXML(w);

  conn.postCommand(w, function(aError, aResponse) {
    logWBXML(aResponse);
    if (aError) {
      alert(aError)
      return;
    }

    let body;
    let e = new WBXML.EventParser();
    e.addEventListener([io.ItemOperations, io.Response,
                        io.Fetch, io.Properties],
                       function(node) {
      for (let [,child] in Iterator(node.children)) {
        if (child.tag === asb.Body) {
          for (let [,grandchild] in Iterator(child.children)) {
            if (grandchild.tag === asb.Data)
              body = grandchild.children[0].textContent;
          }
        }
        else if (child.tag === em.Body) {
          body = child.children[0].textContent;
        }
      }
    });
    e.run(aResponse);

    if (contentType === asbEnum.Type.HTML)
      messageNode.innerHTML = body;
    else
      messageNode.textContent = body;
  });
}

function partialSync(folderInfo) {
  let folder;
  for (let [,tmp] in Iterator(account.folders)) {
    if (folderInfo === tmp.serverId ||
        folderInfo === tmp.name) {
      folder = tmp;
      break;
    }
  }
  if (!folder) {
    alert("Can't find folder "+folderInfo);
    return;
  }

  const as = ActiveSyncCodepages.AirSync.Tags;
  const asEnum = ActiveSyncCodepages.AirSync.Enums;
  const asb = ActiveSyncCodepages.AirSyncBase.Tags;
  const asbEnum = ActiveSyncCodepages.AirSyncBase.Enums;
  const em = ActiveSyncCodepages.Email.Tags;

  clearLog();

  function getPartial() {
    let w = new WBXML.Writer('1.3', 1, 'UTF-8');
    w.stag(as.Sync)
       .stag(as.Collections)
         .stag(as.Collection)
           .tag(as.SyncKey, folder.syncKey)
           .tag(as.CollectionId, folder.serverId)
           .tag(as.GetChanges)
           .tag(as.WindowSize, '2')
         .etag()
       .etag()
     .etag();
    logWBXML(w);

    conn.postCommand(w, function(aError, aResponse) {
      logWBXML(aResponse);
      if (aError) {
        alert(aError)
        return;
      }

      let e = new WBXML.EventParser();
      let moreAvailable = false;
      e.addEventListener([as.Sync, as.Collections, as.Collection, as.SyncKey],
                         function(node) {
        folder.syncKey = node.children[0].textContent;
      });
      e.addEventListener([as.Sync, as.Collections, as.Collection,
                          as.MoreAvailable], function(node) {
        moreAvailable = true;
      });

      e.run(aResponse);

      if (moreAvailable)
        getPartial();
    });
  }

  getSyncKey(folder, getPartial);
}

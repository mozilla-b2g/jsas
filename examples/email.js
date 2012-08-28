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

var account = {
  folders: [],
};

var conn;
window.addEventListener('load', function() {
  conn = new ActiveSyncProtocol.Connection(email, password);

  const fh = ActiveSyncCodepages.FolderHierarchy.Tags;
  let w = new WBXML.Writer('1.3', 1, 'UTF-8');
  w.stag(fh.FolderSync)
     .tag(fh.SyncKey, '0')
   .etag();
  logWBXML(w);

  conn.doCommand(w, function(aError, aResponse) {
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
}, false);

function getSyncKey(folder, callback) {
  const as = ActiveSyncCodepages.AirSync.Tags;

  let w = new WBXML.Writer('1.3', 1, 'UTF-8');
  w.stag(as.Sync)
     .stag(as.Collections)
       .stag(as.Collection)

  if (conn.currentVersionInt < ActiveSyncProtocol.VersionInt('12.1'))
        w.tag(as.Class, 'Email');

        w.tag(as.SyncKey, '0')
         .tag(as.CollectionId, folder.serverId)
       .etag()
     .etag()
   .etag();
  logWBXML(w);

  conn.doCommand(w, function(aError, aResponse) {
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

    if (conn.currentVersionInt < ActiveSyncProtocol.VersionInt('12.1'))
          w.tag(as.Class, 'Email');

          w.tag(as.SyncKey, folder.syncKey)
           .tag(as.CollectionId, folder.serverId)
           .tag(as.GetChanges)
           .stag(as.Options)

    if (getBodies) {
      if (conn.currentVersionInt >= ActiveSyncProtocol.VersionInt('12.0'))
            w.stag(asb.BodyPreference)
               .tag(asb.Type, asbEnum.Type.PlainText)
             .etag();

            w.tag(as.MIMESupport, asEnum.MIMESupport.Never)
             .tag(as.MIMETruncation, asEnum.MIMETruncation.Truncate100K);
    }
    else if (conn.currentVersionInt < ActiveSyncProtocol.VersionInt('12.0')) {
            w.tag(as.MIMESupport, asEnum.MIMESupport.Never)
             .tag(as.Truncation, asEnum.MIMETruncation.TruncateAll);
    }

          w.etag()
         .etag()
       .etag()
     .etag();
    logWBXML(w);

    conn.doCommand(w, function(aError, aResponse) {
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
         .stag(asb.BodyPreference)
           .tag(asb.Type, contentType)
         .etag()
       .etag()
     .etag()
   .etag();
  logWBXML(w);

  conn.doCommand(w, function(aError, aResponse) {
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

function partialSync(folderId) {
  const as = ActiveSyncCodepages.AirSync.Tags;
  const asEnum = ActiveSyncCodepages.AirSync.Enums;
  const asb = ActiveSyncCodepages.AirSyncBase.Tags;
  const asbEnum = ActiveSyncCodepages.AirSyncBase.Enums;
  const em = ActiveSyncCodepages.Email.Tags;

  clearLog();

  function getPartial(syncKey, callback) {
    let w = new WBXML.Writer('1.3', 1, 'UTF-8');
    w.stag(as.Sync)
       .stag(as.Collections)
         .stag(as.Collection)
           .tag(as.SyncKey, syncKey)
           .tag(as.CollectionId, folderId)
           .tag(as.GetChanges)
           .tag(as.WindowSize, '2')
         .etag()
       .etag()
     .etag();
    logWBXML(w);

    conn.doCommand(w, function(aError, aResponse) {
      logWBXML(aResponse);
      if (aError) {
        alert(aError)
        return;
      }

      let e = new WBXML.EventParser();
      e.addEventListener([as.Sync, as.Collections, as.Collection, as.SyncKey],
                         function(node) {
        syncKeys[folderId] = node.children[0].textContent;
      });

      e.run(aResponse);
      if (callback)
        callback(syncKeys[folderId]);
    });
  }

  getSyncKey(folderId, function(syncKey) {
    getPartial(syncKey, getPartial);
  });
}

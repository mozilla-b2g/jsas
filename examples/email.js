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

var conn;
window.addEventListener('load', function() {
  conn = new ActiveSyncProtocol.Connection(email, password);

  let fh = ActiveSyncCodepages.FolderHierarchy.Tags;
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

    let fh = ActiveSyncCodepages.FolderHierarchy.Tags;
    let foldersNode = document.getElementById('folders');

    let e = new WBXML.EventParser();

    let first = true;
    e.addEventListener([fh.FolderSync, fh.Changes, fh.Add], function(node) {
      let folderData = {};
      for (let [,child] in Iterator(node.children))
        folderData[child.localTagName] = child.children[0].textContent;

      let row = document.createElement('div');
      row.className = 'folder';
      row.textContent = folderData.DisplayName;
      row.addEventListener('click', function() {
        getMessages(folderData);
      }, false);
      foldersNode.appendChild(row);

      if (first) {
        first = false;
        getMessages(folderData);
      }
    });

    e.run(aResponse);
  });
}, false);

function getMessages(folderData, getBodies) {
  let messagesNode = document.getElementById('messages');
  while (messagesNode.lastChild)
    messagesNode.removeChild(messagesNode.lastChild);

  let folderName = document.createElement('h1');
  folderName.textContent = folderData.DisplayName;
  messagesNode.appendChild(folderName);

  let as = ActiveSyncCodepages.AirSync.Tags;
  let asb = ActiveSyncCodepages.AirSyncBase.Tags;
  let em = ActiveSyncCodepages.Email.Tags;

  let w = new WBXML.Writer('1.3', 1, 'UTF-8');
  w.stag(as.Sync)
     .stag(as.Collections)
       .stag(as.Collection)

  if (conn.currentVersionInt < ActiveSyncProtocol.VersionInt('12.1'))
        w.tag(as.Class, 'Email');

        w.tag(as.SyncKey, '0')
         .tag(as.CollectionId, folderData.ServerId)
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

    let syncKey;
    let e = new WBXML.EventParser();
    e.addEventListener([as.Sync, as.Collections, as.Collection, as.SyncKey],
                       function(node) {
      syncKey = node.children[0].textContent;
    });
    e.run(aResponse);

    let w = new WBXML.Writer('1.3', 1, 'UTF-8');
    w.stag(as.Sync)
       .stag(as.Collections)
         .stag(as.Collection)

    if (conn.currentVersionInt < ActiveSyncProtocol.VersionInt('12.1'))
          w.tag(as.Class, 'Email');

          w.tag(as.SyncKey, syncKey)
           .tag(as.CollectionId, folderData.ServerId)
           .tag(as.GetChanges)
           .stag(as.Options)

    if (getBodies) {
      if (conn.currentVersionInt >= ActiveSyncProtocol.VersionInt('12.0'))
            w.stag(asb.BodyPreference)
               .tag(asb.Type, '1')
             .etag();

            w.tag(as.MIMESupport, '0')
             .tag(as.MIMETruncation, '7');
    }
    else if (conn.currentVersionInt < ActiveSyncProtocol.VersionInt('12.0')) {
            w.tag(as.MIMESupport, '0')
             .tag(as.Truncation, '0');
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
        syncKey = node.children[0].textContent;
      });
      e.addEventListener([as.Sync, as.Collections, as.Collection, as.Commands,
                          as.Add],
                         function(node) {
        let headers = {};

        for (let [,child] in Iterator(node.children)) {
          if (child.tag == as.ServerId) {
            headers.serverId = child.children[0].textContent;
          }
          if (child.tag == as.ApplicationData) {
            for (let [,grandchild] in Iterator(child.children)) {
              let grandchildText = grandchild.children.length &&
                                   grandchild.children[0].textContent;

              if (grandchild.tag == em.Subject)
                headers.subject = grandchildText;
            }
          }
        }

        let message = document.createElement('div');
        message.textContent = headers.subject;
        message.addEventListener('click', function() {
          getMessage(syncKey, folderData.ServerId, headers.serverId);
        }, false);
        messagesNode.appendChild(message);
      });

      e.run(aResponse);
    });
  });
}

function getMessage(syncKey, folderId, messageId) {
  let messageNode = document.getElementById('message');

  let as = ActiveSyncCodepages.AirSync.Tags;
  let asb = ActiveSyncCodepages.AirSyncBase.Tags;
  let em = ActiveSyncCodepages.Email.Tags;

  let w = new WBXML.Writer('1.3', 1, 'UTF-8');
  w.stag(as.Sync)
     .stag(as.Collections)
       .stag(as.Collection)

  if (conn.currentVersionInt < ActiveSyncProtocol.VersionInt('12.1'))
        w.tag(as.Class, 'Email');

        w.tag(as.SyncKey, syncKey)
         .tag(as.CollectionId, folderId)
         .stag(as.Options)

  if (conn.currentVersionInt >= ActiveSyncProtocol.VersionInt('12.0'))
          w.stag(asb.BodyPreference)
             .tag(asb.Type, '1')
           .etag();

          w.tag(as.MIMESupport, '0')
           .tag(as.MIMETruncation, '7')
         .etag()
         .stag(as.Commands)
           .stag(as.Fetch)
             .tag(as.ServerId, messageId)
           .etag()
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

    let e = new WBXML.EventParser();
    e.addEventListener([as.Sync, as.Collections, as.Collection, as.Responses,
                        as.Fetch, as.ApplicationData],
    function(node) {
      for (let [,child] in Iterator(node.children)) {
        if (child.tag == asb.Body) {
          for (let [,grandchild] in Iterator(child.children)) {
            if (grandchild.tag == asb.Data)
              messageNode.textContent = grandchild.children[0].textContent;
          }
        }
        else if (child.tag == em.Body) {
          messageNode.textContent = child.children[0].textContent;
        }
      }
    });
    e.run(aResponse);
  });
}

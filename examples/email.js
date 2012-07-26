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

function logXhr(xhr) {
  log(xhr.status + ' ' + xhr.statusText + '\n' +
      xhr.getAllResponseHeaders() + '\n');
  try {
    log(xhr.responseText + '\n');
  } catch(e) {}

  log('\n');
}

var conn;
window.addEventListener('load', function() {
  conn = new ActiveSyncProtocol.Connection(email, password);

  let fh = ActiveSyncCodepages.FolderHierarchy.Tags;
  let w = new WBXML.Writer('1.3', 1, 'UTF-8');
  w.stag(fh.FolderSync)
     .tag(fh.SyncKey, '0')
   .etag();

  conn.doCommand(w, function(aResponse) {
    let fh = ActiveSyncCodepages.FolderHierarchy.Tags;
    let foldersNode = document.getElementById('folders');

    let e = new WBXML.EventParser();

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
    });

    e.run(aResponse);
  });
}, false);

function getMessages(folderData) {
  let messagesNode = document.getElementById('messages');
  while (messagesNode.lastChild)
    messagesNode.removeChild(messagesNode.lastChild);

  let folderName = document.createElement('h1');
  folderName.textContent = folderData.DisplayName;
  messagesNode.appendChild(folderName);

  let as = ActiveSyncCodepages.AirSync.Tags;
  let em = ActiveSyncCodepages.Email.Tags;

  let w = new WBXML.Writer('1.3', 1, 'UTF-8');
  w.stag(as.Sync)
     .stag(as.Collections)
       .stag(as.Collection)
         .tag(as.SyncKey, '0')
         .tag(as.CollectionId, folderData.ServerId)
       .etag()
     .etag()
   .etag();

  conn.doCommand(w, function(aResponse) {
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
           .tag(as.SyncKey, syncKey)
           .tag(as.CollectionId, folderData.ServerId)
         .etag()
       .etag()
     .etag();

    conn.doCommand(w, function(aResponse) {
      let e = new WBXML.EventParser();
      e.addEventListener([as.Sync, as.Collections, as.Collection, as.SyncKey],
                         function(node) {
        syncKey = node.children[0].textContent;
      });
      e.addEventListener([as.Sync, as.Collections, as.Collection, as.Commands,
                          as.Add, as.ApplicationData],
                         function(node) {
        let headers = {};

        for (let [,child] in Iterator(node.children)) {
          let childText = child.children.length &&
                          child.children[0].textContent;

          if (child.tag == em.Subject)
            headers.subject = childText;
        }

        let message = document.createElement('div');
        message.textContent = headers.subject;
        messagesNode.appendChild(message);
      });

      e.run(aResponse);
    });
  });
}

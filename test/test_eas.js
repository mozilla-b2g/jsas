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

function log(s) {
  let output = document.getElementById("log");
  output.textContent += s;
}

function logXhr(xhr) {
  log(xhr.status + " " + xhr.statusText + "\n" +
      xhr.getAllResponseHeaders() + "\n");
  try {
    log(xhr.responseText + "\n");
  } catch(e) {}

  log("\n");
}

var conn;
window.addEventListener("load", function() {
  conn = new ActiveSyncProtocol.Connection(
    email, password, function(aResult) {
      let fh = ActiveSyncCodepages.FolderHierarchy.Tags;
      let w = new WBXML.Writer("1.3", 1, "UTF-8");
      w.stag(fh.FolderSync)
         .tag(fh.SyncKey, "0")
       .etag();

      this.doCommand(w, function(aResponse) {
        let fh = ActiveSyncCodepages.FolderHierarchy.Tags;
        let get_simple_node = function() {
          let stag = aResponse.document.next();
          if (stag.type != "STAG")
            throw new Error("expected STAG node");

          let text = aResponse.document.next();
          if (text.type != "TEXT")
            throw new Error("expected TEXT node");

          if (aResponse.document.next().type != "ETAG")
            throw new Error("expected ETAG node");

          return [stag.localTagName, text.textContent];
        };

        let foldersNode = document.getElementById("folders");
        for (let node in aResponse.document) {
          if (node.type == "STAG" && node.tag == fh.Add) {
            let folderData = {};
            for (let i = 0; i < 4; i++) {
              let [key, value] = get_simple_node();
              folderData[key] = value;
            }
            if (aResponse.document.next().type != "ETAG")
              throw new Error("expected ETAG node");

            let row = document.createElement("div");
            row.className = "folder";
            row.textContent = folderData.DisplayName;
            row.addEventListener("click", function() {
              getMessages(folderData);
            }, false);
            foldersNode.appendChild(row);
          }
        }
      });
    });
}, false);

function getMessages(folderData) {
  let messagesNode = document.getElementById("messages");
  messagesNode.innerHTML = "";

  let folderName = document.createElement("h1");
  folderName.textContent = folderData.DisplayName;
  messagesNode.appendChild(folderName);

  let as = ActiveSyncCodepages.AirSync.Tags;
  let em = ActiveSyncCodepages.Email.Tags;

  let w = new WBXML.Writer("1.3", 1, "UTF-8");
  w.stag(as.Sync)
     .stag(as.Collections)
       .stag(as.Collection)
         .tag(as.SyncKey, "0")
         .tag(as.CollectionId, folderData.ServerId)
       .etag()
     .etag()
   .etag();

  conn.doCommand(w, function(aResponse) {
    let syncKey;

    for (let node in aResponse.document) {
      if (node.type == "STAG" && node.tag == as.SyncKey) {
          let text = aResponse.document.next();
          if (text.type != "TEXT")
            throw new Error("expected TEXT node");

          if (aResponse.document.next().type != "ETAG")
            throw new Error("expected ETAG node");

        syncKey = text.textContent;
      }
    }

    let w = new WBXML.Writer("1.3", 1, "UTF-8");
    w.stag(as.Sync)
       .stag(as.Collections)
         .stag(as.Collection)
           .tag(as.SyncKey, syncKey)
           .tag(as.CollectionId, folderData.ServerId)
           .tag(as.GetChanges)
         .etag()
       .etag()
     .etag();

    conn.doCommand(w, function(aResponse) {
      for (let node in aResponse.document) {
        if (node.type == "STAG" && node.tag == em.Subject) {
          let text = aResponse.document.next();
          if (text.type != "TEXT")
            throw new Error("expected TEXT node");

          if (aResponse.document.next().type != "ETAG")
            throw new Error("expected ETAG node");

          let message = document.createElement("div");
          message.textContent = text.textContent;
          messagesNode.appendChild(message);
        }
      }
    });
  });
}

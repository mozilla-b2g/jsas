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

function print(s) {
  let output = document.getElementById("messages");
  output.textContent += s;
}

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

window.addEventListener("load", function() {
  print("Starting up...\n");

  let conn = new ActiveSyncProtocol.Connection(
    email, password, function(aResult) {
      print(JSON.stringify(aResult, null, 2)+"\n\n");

      let fh = ActiveSyncCodepages.FolderHierarchy.Tags;
      let w = new WBXML.Writer("1.3", 1, 106 /* UTF-8 */);
      w.stag(fh.FolderSync)
         .tag(fh.SyncKey, "0")
       .etag();

      this.doCommand(w, function(aResponse) {
        let next = false;
        let fh = ActiveSyncCodepages.FolderHierarchy.Tags;
        for (let node in aResponse.document) {
          if (next) {
            print(node.textContent+"\n");
            next = false;
          }
          else if (node.type == "STAG" && node.tag == fh.DisplayName) {
            next = true;
          }
        }
      });
    });
}, false);

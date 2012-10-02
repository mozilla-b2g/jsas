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

const t = ActiveSyncCodepages.AirSync.Tags;

let account = {
  folders: [],
};

let conn;

let DEBUG = true;

function log(s) {
  let output = document.getElementById('log');
  output.textContent += s;
}

function clearLog() {
  let output = document.getElementById('log');
  output.textContent = '';
}

function logWBXML(data) {
  if (!DEBUG) return;

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

function makeSync(calendarFolderId, syncKey) {
  let addGetChanges = true;

  if (syncKey === undefined) {
    syncKey = '0';
    addGetChanges = false;
  }

  let w = new WBXML.Writer('1.3', 1, 'UTF-8');
  w.stag(t.Sync)
    .stag(t.Collections)
      .stag(t.Collection)
        .tag(t.SyncKey, syncKey)
        .tag(t.CollectionId, calendarFolderId)

  if (addGetChanges) {
        w.tag(t.GetChanges);
  }

        w.tag(t.DeletesAsMoves, '1')
        .tag(t.WindowSize, '100')
      .etag()
    .etag()
  .etag();
  logWBXML(w);
  return w;
}

function getElementData(node) {
  let data = {};
  for (let [,child] in Iterator(node.children)) {
    data[child.localTagName] = child.children[0].textContent;
  }
  return data;
}

window.addEventListener('load', function() {
  conn = new ActiveSyncProtocol.Connection(email, password);
  conn.connect(function(aError) {
    if (aError) {
      alert(aError);
      return;
    }

    const fh = ActiveSyncCodepages.FolderHierarchy.Tags;
    let w = new WBXML.Writer('1.3', 1, 'UTF-8');
    w.stag(fh.FolderSync).tag(fh.SyncKey, '0').etag();
    logWBXML(w);

    conn.postCommand(w, function(aError, aResponse) {
      const enums = ActiveSyncCodepages.FolderHierarchy.Enums;

      let e = new WBXML.EventParser();

      let first = true;
      e.addEventListener([fh.FolderSync, fh.Changes, fh.Add], function(node) {
        let folderData = getElementData(node);

        if (folderData.Type !== enums.Type.DefaultCalendar) {
          return;
        }

        let calendarFolderId = folderData.ServerId;

        var calendarLink = document.createElement('a');
        calendarLink.href = "#" + calendarFolderId;
        calendarLink.textContent = calendarFolderId;
        document.getElementById('calendars').appendChild(calendarLink);
        calendarLink.onclick = function(e) {
          e.preventDefault();

          let events = document.getElementById('events');
          events.innerHTML = "";
          let title = document.createElement('h1');
          title.textContent = calendarFolderId;
          events.appendChild(title);

          let w = makeSync(calendarFolderId, folderData.SyncKey);
  
          conn.postCommand(w, function(aError, aResponse) {
            logWBXML(aResponse);
            if (aError) {
              alert(aError)
              return;
            }
  
            let e = new WBXML.EventParser();
            let moreAvailable = false;
            e.addEventListener(
            [t.Sync, t.Collections, t.Collection, t.SyncKey], function(node) {
              let calendarSyncKey = node.children[0].textContent;
              let w = makeSync(calendarFolderId, calendarSyncKey);
  
              conn.postCommand(w, function(aError, aResponse) {
                logWBXML(aResponse);
                if (aError) {
                  alert(aError)
                  return;
                }
                let e = new WBXML.EventParser();
                let moreAvailable = false;
                e.addEventListener(
                [t.Sync, t.Collections, t.Collection, t.Commands, t.Add, t.ApplicationData], function(node) {
                  let eventData = getElementData(node);
                  console.log(JSON.stringify(eventData));
                  let eventNode = document.createElement('dl');
                  events.appendChild(eventNode);
                  let keys = ['Subject', 'DtStamp', 'OrganizerEmail'];
                  for (let index in keys) {
                    let key = keys[index];
                    let title = document.createElement('dt');
                    title.textContent = key;
                    eventNode.appendChild(title);
                    let data = document.createElement('dd');
                    data.textContent = eventData[key];
                    eventNode.appendChild(data);
                  }                  
                });
                e.run(aResponse);
              });
            });
            e.run(aResponse);
          });
        }
      });
      e.run(aResponse);
    });
  });
}, false);

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

function nsResolver(prefix) {
  const baseUrl = "http://schemas.microsoft.com/exchange/autodiscover/";
  const ns = {
    "ad": baseUrl + "responseschema/2006",
    "ms": baseUrl + "mobilesync/responseschema/2006",
  };
  return ns[prefix] || null;
}

function autodiscover(aEmail, aPassword, aCallback) {
  // TODO: we need to be smarter here and do some stuff with redirects and
  // other fun stuff, but this works for hotmail, so yay.

  let xhr = new XMLHttpRequest({mozSystem: true});
  xhr.open("POST", "https://m.hotmail.com/autodiscover/autodiscover.xml", true,
           aEmail, aPassword);
  xhr.onload = function() {
    logXhr(xhr);

    let doc = new DOMParser().parseFromString(xhr.responseText, "text/xml");
    let getString = function(xpath, rel) {
      return doc.evaluate(xpath, rel, nsResolver, XPathResult.STRING_TYPE,
                          null).stringValue;
    };

    let error = doc.evaluate(
      "/ad:Autodiscover/ms:Response/ms:Error", doc, nsResolver,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (error) {
      aCallback({
        "error": {
          "message": getString("ms:Message/text()", error),
        }
      });
    }
    else {
      let user = doc.evaluate(
        "/ad:Autodiscover/ms:Response/ms:User", doc, nsResolver,
        XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      let server = doc.evaluate(
        "/ad:Autodiscover/ms:Response/ms:Action/ms:Settings/ms:Server", doc,
        nsResolver, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

      let result = {
        "user": {
          "name":  getString("ms:DisplayName/text()",  user),
          "email": getString("ms:EMailAddress/text()", user),
        },
        "server": {
          "type": getString("ms:Type/text()", server),
          "url":  getString("ms:Url/text()",  server),
          "name": getString("ms:Name/text()", server),
        }
      };
      options(result.server.url, function(aResult) {
        result.options = aResult;
        aCallback(result);
      });
    }

  };

  // TODO: use something like http://ejohn.org/blog/javascript-micro-templating/
  // here?
  let postdata =
  '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/mobilesync/requestschema/2006">\n' +
  '  <Request>\n' +
  '    <EMailAddress>' + aEmail + '</EMailAddress>\n' +
  '      <AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/mobilesync/responseschema/2006</AcceptableResponseSchema>\n' +
  '  </Request>\n' +
  '</Autodiscover>';

  xhr.setRequestHeader("Content-Type", "text/xml");
  xhr.send(postdata);
}

function options(aHost, aCallback) {
  let xhr = new XMLHttpRequest({mozSystem: true});
  xhr.open("OPTIONS", aHost + "/Microsoft-Server-ActiveSync", true);
  xhr.onload = function() {
    logXhr(xhr);

    let result = {
      "versions": xhr.getResponseHeader("MS-ASProtocolVersions").split(","),
      "commands": xhr.getResponseHeader("MS-ASProtocolCommands").split(","),
    };
    aCallback(result);
  };

  xhr.send();
}

function doCommand(aBaseUrl, aXml) {
  let r = new WBXML.Reader(aXml, ActiveSync);
  let command = r.document.next().localTagName;
  let xhr = new XMLHttpRequest({mozSystem: true});
  xhr.open("POST", aBaseUrl + "?Cmd=" + command + "&User="+"gaia-eas-test"+
           "&DeviceId=v140Device&DeviceType=SmartPhone", true, email,
           password);
  xhr.setRequestHeader("MS-ASProtocolVersion", "14.0");
  xhr.setRequestHeader("Content-Type", "application/vnd.ms-sync.wbxml");
  xhr.setRequestHeader("User-Agent", "B2G");

  xhr.onload = function() {
    logXhr(xhr);

    if (xhr.status == 451) {
      let newBaseUrl = xhr.getResponseHeader("X-MS-Location")
      doCommand(newBaseUrl, aXml);
      return;
    }
    if (xhr.status != 200) {
      print("Error!\n");
      return;
    }

    let r = new WBXML.Reader(new Uint8Array(xhr.response), ActiveSync);
    log(r.dump());
    r.rewind();

    let next = false;
    let fh = ActiveSync.FolderHierarchy.Tags;
    for (let node in r.document) {
      if (next) {
        print(node.textContent+"\n");
        next = false;
      }
      else if (node.type == "STAG" && node.tag == fh.DisplayName) {
        next = true;
      }
    }
  };

  xhr.responseType = "arraybuffer";
  xhr.send(aXml.buffer);
}

window.addEventListener("load", function() {
  print("Starting up...\n");
  autodiscover(email, password, function(aResult) {
    print(JSON.stringify(aResult, null, 2)+"\n\n");

    let baseUrl = aResult.server.url + "/Microsoft-Server-ActiveSync";
    let fh = ActiveSync.FolderHierarchy.Tags;
    let w = new WBXML.Writer("1.3", 1, 106 /* UTF-8 */);
    w.stag(fh.FolderSync)
       .tag(fh.SyncKey, "0")
     .etag();

    doCommand(baseUrl, w);
  });
}, false);

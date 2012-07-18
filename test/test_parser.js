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

// Currently, the following is just copied from jswbxml. We should handle it in
// a better way later.

function binify(src) {
  let dest = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    if (typeof src[i] == "number")
      dest[i] = src[i];
    else if (typeof src[i] == "string")
      dest[i] = src[i].charCodeAt(0);
    else
      throw "bad value";
  }
  return dest;
}

function print(s) {
  let output = document.getElementById("output");
  output.textContent += s;
}

function assert(expr, reason) {
  if (!expr)
    throw new Error(reason);
}

function assert_equals(a, b, reason) {
  assert(a == b, reason ? reason : a + " should be equal to " + b);
}

function assert_throws(f, type) {
  let threw = false;
  try {
    f();
  }
  catch (e if !type || e instanceof type) {
    threw = true;
  }
  if (!threw)
    throw new Error("exception expected, but not found");
}

/**
 * Zip some iterators together to walk through them in lock-step.
 */
function zip() {
  while (true) {
    let ends = 0;
    let step = []
    for (let i = 0; i < arguments.length; i++) {
      try {
        step.push(arguments[i].next());
      } catch (e if e instanceof StopIteration) {
        ends++;
      }
    }
    if (ends == arguments.length)
      throw StopIteration;
    else if (ends != 0)
      throw new Error("Zipped iterators have differing lengths!");

    yield step;
  }
}

function verify_wbxml(reader, expectedVersion, expectedPid, expectedCharset,
                      expectedNodes) {
  assert_equals(reader.version, expectedVersion);
  assert_equals(reader.pid, expectedPid);
  assert_equals(reader.charset, expectedCharset);

  for (let [node, expected] in
       zip( reader.document, (expectedNodes[i] for (i in expectedNodes)) )) {
    assert_equals(node.type, expected.type);

    switch (node.type) {
    case "STAG":
    case "TAG":
      assert_equals(node.tag, expected.tag);
      assert_equals(node.localTag, expected.tag && (expected.tag & 0xff));
      assert_equals(node.namespace, expected.tag && (expected.tag >> 8));

      assert_equals(node.localTagName, expected.localTagName);

      for (let [name, value] in node.attributes)
        assert_equals(value, expected.attributes[name]);

      if (expected.attributes) {
        for (let [name, value] in Iterator(expected.attributes))
          assert_equals(value, node.getAttribute(name));
      }
      break;
    case "TEXT":
      assert_equals(node.textContent, expected.textContent);
      break;
    case "PI":
      assert_equals(node.target, expected.target);
      assert_equals(node.data, expected.data);
      break;
    case "EXT":
      assert_equals(node.subtype, expected.subtype);
      assert_equals(node.index, expected.index);
      assert_equals(node.value, expected.value);
      break;
    case "OPAQUE":
      assert_equals(node.data, expected.data);
    }
  }
}

// http://msdn.microsoft.com/en-us/library/ee237245%28v=exchg.80%29
function test_activesync_example() {
  let data = binify([
    0x03, 0x01, 0x6A, 0x00, 0x45, 0x5C, 0x4F, 0x50, 0x03, 0x43, 0x6F, 0x6E,
    0x74, 0x61, 0x63, 0x74, 0x73, 0x00, 0x01, 0x4B, 0x03, 0x32, 0x00, 0x01,
    0x52, 0x03, 0x32, 0x00, 0x01, 0x4E, 0x03, 0x31, 0x00, 0x01, 0x56, 0x47,
    0x4D, 0x03, 0x32, 0x3A, 0x31, 0x00, 0x01, 0x5D, 0x00, 0x11, 0x4A, 0x46,
    0x03, 0x31, 0x00, 0x01, 0x4C, 0x03, 0x30, 0x00, 0x01, 0x4D, 0x03, 0x31,
    0x00, 0x01, 0x01, 0x00, 0x01, 0x5E, 0x03, 0x46, 0x75, 0x6E, 0x6B, 0x2C,
    0x20, 0x44, 0x6F, 0x6E, 0x00, 0x01, 0x5F, 0x03, 0x44, 0x6F, 0x6E, 0x00,
    0x01, 0x69, 0x03, 0x46, 0x75, 0x6E, 0x6B, 0x00, 0x01, 0x00, 0x11, 0x56,
    0x03, 0x31, 0x00, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01
  ]);

  let as = ActiveSyncCodepages.AirSync.Tags;
  let asb = ActiveSyncCodepages.AirSyncBase.Tags;
  let c = ActiveSyncCodepages.Contacts.Tags;
  let expectedNodes = [
    { type: "STAG", tag: as.Sync, localTagName: "Sync" },
      { type: "STAG", tag: as.Collections, localTagName: "Collections" },
        { type: "STAG", tag: as.Collection, localTagName: "Collection" },
          { type: "STAG", tag: as.Class, localTagName: "Class" },
            { type: "TEXT", textContent: "Contacts" },
          { type: "ETAG" },
          { type: "STAG", tag: as.SyncKey, localTagName: "SyncKey" },
            { type: "TEXT", textContent: "2" },
          { type: "ETAG" },
          { type: "STAG", tag: as.CollectionId, localTagName: "CollectionId" },
            { type: "TEXT", textContent: "2" },
          { type: "ETAG" },
          { type: "STAG", tag: as.Status, localTagName: "Status" },
            { type: "TEXT", textContent: "1" },
          { type: "ETAG" },

          { type: "STAG", tag: as.Commands, localTagName: "Commands" },
            { type: "STAG", tag: as.Add, localTagName: "Add" },
              { type: "STAG", tag: as.ServerId, localTagName: "ServerId" },
                { type: "TEXT", textContent: "2:1" },
              { type: "ETAG" },
              { type: "STAG", tag: as.ApplicationData, localTagName: "ApplicationData" },
                { type: "STAG", tag: asb.Body, localTagName: "Body" },
                  { type: "STAG", tag: asb.Type, localTagName: "Type" },
                    { type: "TEXT", textContent: "1" },
                  { type: "ETAG" },
                  { type: "STAG", tag: asb.EstimatedDataSize, localTagName: "EstimatedDataSize" },
                    { type: "TEXT", textContent: "0" },
                  { type: "ETAG" },
                  { type: "STAG", tag: asb.Truncated, localTagName: "Truncated" },
                    { type: "TEXT", textContent: "1" },
                  { type: "ETAG" },
                { type: "ETAG" },
                { type: "STAG", tag: c.FileAs, localTagName: "FileAs" },
                  { type: "TEXT", textContent: "Funk, Don" },
                { type: "ETAG" },
                { type: "STAG", tag: c.FirstName, localTagName: "FirstName" },
                  { type: "TEXT", textContent: "Don" },
                { type: "ETAG" },
                { type: "STAG", tag: c.LastName, localTagName: "LastName" },
                  { type: "TEXT", textContent: "Funk" },
                { type: "ETAG" },
                { type: "STAG", tag: asb.NativeBodyType, localTagName: "NativeBodyType" },
                  { type: "TEXT", textContent: "1" },
                { type: "ETAG" },
              { type: "ETAG" },
            { type: "ETAG" },
          { type: "ETAG" },
        { type: "ETAG" },
      { type: "ETAG" },
    { type: "ETAG" },
  ];

  let r = new WBXML.Reader(data, ActiveSyncCodepages);
  verify_wbxml(r, "1.3", 1, "UTF-8", expectedNodes);
}

window.addEventListener("load", function() {
  let pass = 0, fail = 0;
  for (let i in window) {
    if (i.match(/^test_/)) {
      try {
        window[i]();
        print(i + " PASSED\n");
        pass++;
      }
      catch(e) {
        print(i + " FAILED: " + e + "\n");
        print(e.stack.replace(/^(.)/mg, "  $1"));
        fail++;
      }
    }
  }

  print("\nPassed: " + pass + " Failed: " + fail + "\n");
}, false);

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

function print(s) {
  let output = document.getElementById('output');
  output.textContent += s;
}

function assert(expr, reason) {
  if (!expr)
    throw new Error(reason);
}

function assert_equals(a, b, reason) {
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    assert_equals(a.length, b.length);
    for (let i = 0; i < a.length; i++)
      assert_equals(a[i], b[i]);
  }
  else {
    assert(a == b, reason ? reason : a + ' should be equal to ' + b);
  }
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
    throw new Error('exception expected, but not found');
}

function assert_attr_equals(a, b, reason) {
  let attr_eq = function(a, b) {
    if (typeof a === 'object' && typeof b === 'object')
      return (a.type === b.type && a.subtype === b.subtype &&
              a.index === b.index && a.value === b.value);
    else
      return a == b;
  }

  let result;
  if (Array.isArray(a) && Array.isArray(b)) {
    result = (a.length === b.length);
    for (let i = 0; i < a.length; i++)
      result = result && attr_eq(a[i], b[i]);
  }
  else {
    result = attr_eq(a, b);
  }

  assert(result, reason ? reason : a + ' should be equal to ' + b);
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
    if (ends === arguments.length)
      throw StopIteration;
    else if (ends !== 0)
      throw new Error('Zipped iterators have differing lengths!');

    yield step;
  }
}

function iter_values(obj) {
  return (val for ( [key, val] in Iterator(obj || []) ));
}

function verify_node(actual, expected) {
  assert_equals(actual.type, expected.type);

  switch (actual.type) {
  case 'STAG':
  case 'TAG':
    assert_equals(actual.tag, expected.tag);
    assert_equals(actual.localTag, expected.tag && (expected.tag & 0xff));
    assert_equals(actual.namespace, expected.tag && (expected.tag >> 8));

    assert_equals(actual.localTagName, expected.localTagName);

    for (let attr in actual.attributes) {
      let [namespace, localName] = attr.name.split(':');
      assert_equals(attr.namespace, namespace);
      assert_equals(attr.localName, localName);

      let expectedAttr = expected.attributes[attr.name];
      if (expectedAttr === undefined && namespace === actual.namespaceName)
        expectedAttr = expected.attributes[attr.localName];

      assert_attr_equals(attr.value, expectedAttr);
    }

    if (expected.attributes) {
      for (let [name, value] in Iterator(expected.attributes))
        assert_attr_equals(value, actual.getAttribute(name));
    }
    break;
  case 'TEXT':
    assert_equals(actual.textContent, expected.textContent);
    break;
  case 'PI':
    assert_equals(actual.target, expected.target);
    assert_equals(actual.data, expected.data);
    break;
  case 'EXT':
    assert_equals(actual.subtype, expected.subtype);
    assert_equals(actual.index, expected.index);
    assert_equals(actual.value, expected.value);
    break;
  case 'OPAQUE':
    assert_equals(actual.data, expected.data);
    break;
  }
}

function verify_document(reader, expectedVersion, expectedPid, expectedCharset,
                         expectedNodes) {
  assert_equals(reader.version, expectedVersion);
  assert_equals(reader.pid, expectedPid);
  assert_equals(reader.charset, expectedCharset);

  for (let [actual, expected] in
       zip( iter_values(reader.document), iter_values(expectedNodes) )) {
    assert_equals(actual.ownerDocument, reader);
    verify_node(actual, expected);
  }
}

function verify_subdocument(actual, expected) {
  verify_node(actual, expected);
  if (actual.children || expected.children) {
    for (let [actualChild, expectedChild] in
         zip(iter_values(actual.children), iter_values(expected.children)) ) {
      verify_subdocument(actualChild, expectedChild);
    }
  }
}

window.addEventListener('load', function() {
  let pass = 0, fail = 0, waiting = 0, done = false;

  function onTestComplete(funcName, error) {
    if (!error) {
      print(funcName + ' PASSED\n');
      pass++;
    }
    else {
      print(funcName + ' FAILED: ' + error + '\n');
      print(error.stack.replace(/^(.)/mg, '  $1'));
      fail++;
    }
  }

  function onAsyncTestComplete(funcName, error) {
    onTestComplete(funcName, error);
    waiting--;
    if (waiting === 0 && done)
      summarize();
  }

  function summarize() {
    print('\nPassed: ' + pass + ' Failed: ' + fail + '\n');
  }

  for (let funcName in window) {
    if (funcName.match(/^test_/)) {
      if (funcName.match(/^test_async_/)) {
        window[funcName](onAsyncTestComplete.bind(null, funcName));
        waiting++;
      }
      else {
        try {
          window[funcName]();
          onTestComplete(funcName);
        }
        catch(error) {
          onTestComplete(funcName, error);
        }
      }
    }
  }
  done = true;

  if (!waiting)
    summarize();
}, false);

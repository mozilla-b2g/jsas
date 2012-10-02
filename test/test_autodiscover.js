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

function test_async_autodiscover(callback) {
  let conn = new ActiveSyncProtocol.Connection(email, password);
  conn.connect(function(aError, aConfig, aOptions) {
    callback(aError);
  });
}

function test_async_autodiscover_badpass(callback) {
  let conn = new ActiveSyncProtocol.Connection(email, 'notmypassword!');
  conn.connect(function(aError, aConfig, aOptions) {
    if (aError)
      callback(null);
    else
      callback(new Error('Autodiscover should have failed!'));
  });
}
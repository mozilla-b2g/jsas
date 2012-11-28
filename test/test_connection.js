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

function test_async_connection_bad_connection(callback) {
  const expectedSeen = 3;
  let seen = 0;
  let errors = [];
  let failureTimeout = setTimeout(function() {
    callback(new Error('Timed out!'));
  }, 1000);
  let connectionCallback = function(error) {
    errors.push(error);
    seen++;

    if (seen === expectedSeen) {
      clearTimeout(failureTimeout);

      // Make sure all the errors are identical.
      for (let i = 1; i < errors.length; i++) {
        if (errors[i] !== errors[0]) {
          callback(new Error("Errors don't match!"));
          return;
        }
      }
      callback(null);
    }
    else if (seen > expectedSeen) {
      callback(new Error("Saw too many callbacks!"));
    }
  };


  let conn = new ActiveSyncProtocol.Connection();
  conn.open('https://this.domain.does.not.exist', 'username', 'password');
  conn.connect(connectionCallback);
  conn.connect(connectionCallback);
  conn.connect(connectionCallback);
}

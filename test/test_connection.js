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
  let conn = new ActiveSyncProtocol.Connection();
  conn.connect('https://this.domain.does.not.exist', 'username', 'password',
               function(aError, aOptions) {
    if (aError) {
      let failureTimeout = setTimeout(function() {
        callback(new Error('Timed out!'));
      }, 1000);

      conn.waitForConnection(function(aInnerError) {
        clearTimeout(failureTimeout);
        if (aError === aInnerError)
          callback(null);
        else
          callback(new Error("Errors don't match!"));
      });
    }
    else
      callback(new Error('Connecting should have failed!'));
  });
}

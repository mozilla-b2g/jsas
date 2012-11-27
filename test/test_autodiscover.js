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

function test_async_autodiscover_hotmail(callback) {
  ActiveSyncProtocol.autodiscover(TEST_HOTMAIL_USERNAME,
                                  TEST_HOTMAIL_PASSWORD,
                                  0,
                                  function(aError, aConfig) {
    if (aError)
      callback(aError);
    else
      subtest_async_autodiscover_hotmail_badpass(callback);
  });
}

function subtest_async_autodiscover_hotmail_badpass(callback) {
  ActiveSyncProtocol.autodiscover(TEST_HOTMAIL_USERNAME,
                                  TEST_HOTMAIL_BAD_PASSWORD,
                                  0,
                                  function(aError, aConfig) {
    if (aError)
      callback(null);
    else
      callback(new Error('Autodiscover should have failed!'));
  });
}

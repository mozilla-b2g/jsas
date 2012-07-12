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

var ActiveSync = {
  AirSync: {
    Tags: {
      Sync:              0x0005,
      Responses:         0x0006,
      Add:               0x0007,
      Change:            0x0008,
      Delete:            0x0009,
      Fetch:             0x000A,
      SyncKey:           0x000B,
      ClientId:          0x000C,
      ServerId:          0x000D,
      Status:            0x000E,
      Collection:        0x000F,
      Class:             0x0010,
      CollectionId:      0x0012,
      GetChanges:        0x0013,
      MoreAvailable:     0x0014,
      WindowSize:        0x0015,
      Commands:          0x0016,
      Options:           0x0017,
      FilterType:        0x0018,
      Conflict:          0x001B,
      Collections:       0x001C,
      ApplicationData:   0x001D,
      DeletesAsMoves:    0x001E,
      Supported:         0x0020,
      SoftDelete:        0x0021,
      MIMESupport:       0x0022,
      MIMETruncation:    0x0023,
      Wait:              0x0024,
      Limit:             0x0025,
      Partial:           0x0026,
      ConversationMode:  0x0027,
      MaxItems:          0x0028,
      HeartbeatInterval: 0x0029,
    },
  },

  Contacts: {
    Tags: {
      Anniversary:               0x0105,
      AssistantName:             0x0106,
      AssistantPhoneNumber:      0x0107,
      Birthday:                  0x0108,
      Business2PhoneNumber:      0x010C,
      BusinessAddressCity:       0x010D,
      BusinessAddressCountry:    0x010E,
      BusinessAddressPostalCode: 0x010F,
      BusinessAddressState:      0x0110,
      BusinessAddressStreet:     0x0111,
      BusinessFaxNumber:         0x0112,
      BusinessPhoneNumber:       0x0113,
      CarPhoneNumber:            0x0114,
      Categories:                0x0115,
      Category:                  0x0116,
      Children:                  0x0117,
      Child:                     0x0118,
      CompanyName:               0x0119,
      Department:                0x011A,
      Email1Address:             0x011B,
      Email2Address:             0x011C,
      Email3Address:             0x011D,
      FileAs:                    0x011E,
      FirstName:                 0x011F,
      Home2PhoneNumber:          0x0120,
      HomeAddressCity:           0x0121,
      HomeAddressCountry:        0x0122,
      HomeAddressPostalCode:     0x0123,
      HomeAddressState:          0x0124,
      HomeAddressStreet:         0x0125,
      HomeFaxNumber:             0x0126,
      HomePhoneNumber:           0x0127,
      JobTitle:                  0x0128,
      LastName:                  0x0129,
      MiddleName:                0x012A,
      MobilePhoneNumber:         0x012B,
      OfficeLocation:            0x012C,
      OtherAddressCity:          0x012D,
      OtherAddressCountry:       0x012E,
      OtherAddressPostalCode:    0x012F,
      OtherAddressState:         0x0130,
      OtherAddressStreet:        0x0131,
      PagerNumber:               0x0132,
      RadioPhoneNumber:          0x0133,
      Spouse:                    0x0134,
      Suffix:                    0x0135,
      Title:                     0x0136,
      WebPage:                   0x0137,
      YomiCompanyName:           0x0138,
      YomiFirstName:             0x0139,
      YomiLastName:              0x013A,
      Picture:                   0x013C,
      Alias:                     0x013D,
      WeightedRank:              0x013E,
    },
  },

  FolderHierarchy: {
    Tags: {
      DisplayName:  0x0707,
      ServerId:     0x0708,
      ParentId:     0x0709,
      Type:         0x070A,
      Status:       0x070C,
      Changes:      0x070E,
      Add:          0x070F,
      Delete:       0x0710,
      Update:       0x0711,
      SyncKey:      0x0712,
      FolderCreate: 0x0713,
      FolderDelete: 0x0714,
      FolderUpdate: 0x0715,
      FolderSync:   0x0716,
      Count:        0x0717,
    },
  },

  AirSyncBase: {
    Tags: {
      BodyPreference:     0x1105,
      Type:               0x1106,
      TruncationSize:     0x1107,
      AllOrNone:          0x1108,
      Body:               0x110A,
      Data:               0x110B,
      EstimatedDataSize:  0x110C,
      Truncated:          0x110D,
      Attachments:        0x110E,
      Attachment:         0x110F,
      DisplayName:        0x1110,
      FileReference:      0x1111,
      Method:             0x1112,
      ContentId:          0x1113,
      ContentLocation:    0x1114,
      IsInline:           0x1115,
      NativeBodyType:     0x1116,
      ContentType:        0x1117,
      Preview:            0x1118,
      BodyPartPreference: 0x1119,
      BodyPart:           0x111A,
      Status:             0x111B,
    },
  },
};

function CompileCodepages(codepages) {
  codepages.__nsnames__ = {};
  codepages.__tagnames__ = {};
  codepages.__attrdata__ = {};

  for (let [name, page] in Iterator(codepages)) {
    if (name.match(/^__/))
      continue;

    if (page.Tags) {
      let [,v] = Iterator(page.Tags).next();
      codepages.__nsnames__[v >> 8] = name;

      for (let [tag, value] in Iterator(page.Tags))
        codepages.__tagnames__[value] = tag;
    }

    if (page.Attrs) {
      for (let [attr, data] in Iterator(page.Attrs)) {
        if (!("name" in data))
          data.name = attr;
        codepages.__attrdata__[data.value] = data;
        page.Attrs[attr] = data.value;
      }
    }
  }
}
CompileCodepages(ActiveSync);

(function () {
  "use strict";
  'use strict';


  var app = angular.module('viewCustom', ['angularLoad', 'hathiTrustAvailability']);


  /* Primo VE HathiTrust Availability Add-On for CARLI I-Share - 12/15/2020
  * adapted from https://github.com/UMNLibraries/primo-explore-hathitrust-availability
  *
  * NOTE: Be sure to add 'hathiTrustAvailability' to the
  *       angular.module() function at the top of the custom.js file,
  *       i.e., add it to the array that also includes 'angularLoad', e.g.:
  *
  * var app = angular.module('viewCustom', ['angularLoad', 'hathiTrustAvailability']);
  *
  * There are several optional configuration choices you can set for the app.component "template":
  *
  * Customizing the Availability Message - The default availability message that displays in the Brief 
  * Results list and the Full Record page is "Full Text Available at HathiTrust". You can override 
  * this by setting the msg attribute:
  * 
  * <hathi-trust-availability msg="Set this text to your preferred message"></hathi-trust-availability>
  * 
  * Selectively Suppress Full-text Links - By default, the component will display full-text links 
  * for any resource.
  * 
  * --If you want it avoid looking for full-text availability on records for which you already have online 
  * access, add the hide-online attribute to the component:
  * 
  * <hathi-trust-availability hide-online="true"></hathi-trust-availability>
  * 
  * --You can also suppress full-text links for journals, if desired, with hide-if-journal option:
  * 
  * <hathi-trust-availability hide-if-journal="true"></hathi-trust-availability>
  * 
  * Copyright Status - By default, the component will display only when the item is out of copyright 
  * and therefore should be accessible.
  * 
  * --If you want to display full-text links to any HathiTrust record, regardless of copyright status, 
  * use the ignore-copyright attribute:
  * 
  * <hathi-trust-availability ignore-copyright="true"></hathi-trust-availability>
  * 
  * --If your institution is a HathiTrust partner institution and you want the availability links 
  * in Primo VE to use HathiTrust's automatic login process, add your SAML IdP's entity ID:
  * 
  * <hathi-trust-availability entity-id="https://shibboleth.inst.edu/idp/shibboleth"></hathi-trust-availability>
  *
  * E.g.,
  * app.component('prmSearchResultAvailabilityLineAfter', {
  *   template: '<hathi-trust-availability hide-online="true" msg="Set this text to your preferred message"></hathi-trust-availability>'
  * });
  *
  */

  app.component('prmSearchResultAvailabilityLineAfter', {
      template: '<hathi-trust-availability></hathi-trust-availability>'
  });

  angular.module('hathiTrustAvailability', []).constant('hathiTrustBaseUrl', 'https://catalog.hathitrust.org/api/volumes/brief/json/').config(['$sceDelegateProvider', 'hathiTrustBaseUrl', function ($sceDelegateProvider, hathiTrustBaseUrl) {
      var urlWhitelist = $sceDelegateProvider.resourceUrlWhitelist();
      urlWhitelist.push(hathiTrustBaseUrl + '**');
      $sceDelegateProvider.resourceUrlWhitelist(urlWhitelist);
  }]).factory('hathiTrust', ['$http', '$q', 'hathiTrustBaseUrl', function ($http, $q, hathiTrustBaseUrl) {
      var svc = {};

      var lookup = function lookup(ids) {
          if (ids.length) {
              var hathiTrustLookupUrl = hathiTrustBaseUrl + ids.join('|');
              return $http.jsonp(hathiTrustLookupUrl, {
                  cache: true,
                  jsonpCallbackParam: 'callback'
              }).then(function (resp) {
                  return resp.data;
              });
          } else {
              return $q.resolve(null);
          }
      };

      // find a HT record URL for a given list of identifiers (regardless of copyright status)
      svc.findRecord = function (ids) {
          return lookup(ids).then(function (bibData) {
              for (var i = 0; i < ids.length; i++) {
                  var recordId = Object.keys(bibData[ids[i]].records)[0];
                  if (recordId) {
                      return $q.resolve(bibData[ids[i]].records[recordId].recordURL);
                  }
              }
              return $q.resolve(null);
          }).catch(function (e) {
              console.error(e);
          });
      };

      // find a public-domain HT record URL for a given list of identifiers
      svc.findFullViewRecord = function (ids) {
          var handleResponse = function handleResponse(bibData) {
              var fullTextUrl = null;
              for (var i = 0; !fullTextUrl && i < ids.length; i++) {
                  var result = bibData[ids[i]];
                  for (var j = 0; j < result.items.length; j++) {
                      var item = result.items[j];
                      if (item.usRightsString.toLowerCase() === 'full view') {
                          fullTextUrl = result.records[item.fromRecord].recordURL;
                          break;
                      }
                  }
              }
              return $q.resolve(fullTextUrl);
          };
          return lookup(ids).then(handleResponse).catch(function (e) {
              console.error(e);
          });
      };

      return svc;
  }]).controller('hathiTrustAvailabilityController', ['hathiTrust', function (hathiTrust) {
      var self = this;

      self.$onInit = function () {
          if (!self.msg) self.msg = 'Full Text Available at HathiTrust';

          // prevent appearance/request iff 'hide-online'
          if (self.hideOnline && isOnline()) {
              return;
          }

          // prevent appearance/request iff 'hide-if-journal'
          if (self.hideIfJournal && isJournal()) {
              return;
          }

          // look for full text at HathiTrust
          updateHathiTrustAvailability();
      };

      var isJournal = function isJournal() {
          var format = self.prmSearchResultAvailabilityLine.result.pnx.addata.format[0];
          return !(format.toLowerCase().indexOf('journal') == -1); // format.includes("Journal")
      };

      var isOnline = function isOnline() {
          var delivery = self.prmSearchResultAvailabilityLine.result.delivery || [];
          if (!delivery.GetIt1) return delivery.deliveryCategory.indexOf('Alma-E') !== -1;
          return self.prmSearchResultAvailabilityLine.result.delivery.GetIt1.some(function (g) {
              return g.links.some(function (l) {
                  return l.isLinktoOnline;
              });
          });
      };

      var formatLink = function formatLink(link) {
          return self.entityId ? link + '?signon=swle:' + self.entityId : link;
      };

      var isOclcNum = function isOclcNum(value) {
          return value.match(/^(\(ocolc\))\d+$/i);
      };
      
      var isOcmNum = function isOcmNum(value) {
          return value.match(/^(ocm)\d+$/i);
      };
      
      var isOcnNum = function isOclcNum(value) {
          return value.match(/^(\(ocn\))\d+$/i);
      };
      
      var isOnNum = function isOcmNum(value) {
          return value.match(/^(on)\d+$/i);
      };
      
      var updateHathiTrustAvailability = function updateHathiTrustAvailability() {
          console.log("035 looks like: " + self.prmSearchResultAvailabilityLine.result.pnx.addata.oclcid);
      
          // Retrieve the oclc id list and filter for both oclc and ocm numbers
          var hathiTrustIds = (self.prmSearchResultAvailabilityLine.result.pnx.addata.oclcid || []).filter(function(id) {
              return isOclcNum(id) || isOcmNum(id) || isOcnNum(id) || isOnNum(id); // Check for all identifiers
          }).map(function(id) {
              if (isOclcNum(id)) {
                  return 'oclc:' + id.toLowerCase().replace('(ocolc)', '');
              } else if (isOcmNum(id)) {
                  return 'oclc:' + id.toLowerCase().replace('ocm', ''); // even though it's ocm, we're calling it oclc for hathitrust
              } else if (isOcnNum(id)) {
                  return 'oclc:' + id.toLowerCase().replace('ocn', ''); // even though it's ocn, we're calling it oclc for hathitrust
              } else if (isOnNum(id)) {
                  return 'oclc:' + id.toLowerCase().replace('on', ''); // even though it's on, we're calling it oclc for hathitrust
              }
          }).filter(Boolean); // Remove any undefined values from the mapping
      
          // Call the HathiTrust API with the filtered IDs
          hathiTrust[self.ignoreCopyright ? 'findRecord' : 'findFullViewRecord'](hathiTrustIds).then(function (res) {
              if (res) self.fullTextLink = formatLink(res);
          });
      };
      
      

  }]).component('hathiTrustAvailability', {
      require: {
          prmSearchResultAvailabilityLine: '^prmSearchResultAvailabilityLine'
      },
      bindings: {
          entityId: '@',
          ignoreCopyright: '<',
          hideIfJournal: '<',
          hideOnline: '<',
          msg: '@?'
      },
      controller: 'hathiTrustAvailabilityController',
      template: '<span ng-if="$ctrl.fullTextLink" class="umnHathiTrustLink">\
              <md-icon alt="HathiTrust Logo">\
                <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="100%" height="100%" viewBox="0 0 16 16" enable-background="new 0 0 16 16" xml:space="preserve">  <image id="image0" width="16" height="16" x="0" y="0"\
                xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABGdBTUEAALGPC/xhBQAAACBjSFJN\
                AAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAACNFBMVEXuegXvegTsewTveArw\
                eQjuegftegfweQXsegXweQbtegnsegvxeQbvegbuegbvegbveQbtegfuegbvegXveQbvegbsfAzt\
                plfnsmfpq1/wplPuegXvqFrrq1znr2Ptok/sewvueQfuegbtegbrgRfxyJPlsXDmlTznnk/rn03q\
                pVnomkjnlkDnsGnvwobsfhPveQXteQrutHDqpF3qnUnpjS/prmDweQXsewjvrWHsjy7pnkvqqGDv\
                t3PregvqhB3uuXjusmzpp13qlz3pfxTskC3uegjsjyvogBfpmkHpqF/us2rttXLrgRjrgBjttXDo\
                gx/vtGznjzPtfhHqjCfuewfrjCnwfxLpjC7wtnDogBvssmjpfhLtegjtnEjrtnTmjC/utGrsew7s\
                o0zpghnohB/roUrrfRHtsmnlkTbrvH3tnEXtegXvegTveQfqhyHvuXjrrGTpewrsrmXqfRHogRjt\
                q2Dqewvqql/wu3vqhyDueQnwegXuegfweQPtegntnUvnt3fvxI7tfhTrfA/vzJvmtXLunEbtegrw\
                egTregzskjbsxI/ouoPsqFzniyrz2K3vyZnokDLpewvtnkv30J/w17XsvYXjgBbohR7nplnso1L0\
                1Kf40Z/um0LvegXngBnsy5juyJXvsGftrGTnhB/opVHoew7qhB7rzJnnmErkkz3splbqlT3smT3t\
                tXPqqV7pjzHvunjrfQ7vewPsfA7uoU3uqlruoEzsfQ/vegf///9WgM4fAAAAFHRSTlOLi4uLi4uL\
                i4uLi4uLi4tRUVFRUYI6/KEAAAABYktHRLvUtndMAAAAB3RJTUUH4AkNDgYNB5/9vwAAAQpJREFU\
                GNNjYGBkYmZhZWNn5ODk4ubh5WMQERUTl5CUEpWWkZWTV1BUYlBWUVVT19BUUtbS1tHV0zdgMDQy\
                NjE1MzRXsrC0sraxtWOwd3B0cnZxlXZz9/D08vbxZfDzDwgMCg4JdQsLj4iMio5hiI2LT0hMSk5J\
                TUvPyMzKzmHIzcsvKCwqLiktK6+orKquYZCuratvaGxqbmlta+8QNRBl6JQ26Oru6e3rnzBx0uQ8\
                aVGGvJopU6dNn1E8c9bsOXPniYoySM+PXbBw0eIlS5fl1C+PFRFlEBUVXbFy1eo1a9fliQDZYIHY\
                9fEbNm7avEUUJiC6ddv2HTt3mSuBBfhBQEBQSEgYzOIHAHtfTe/vX0uvAAAAJXRFWHRkYXRlOmNy\
                ZWF0ZQAyMDE2LTA5LTEzVDE0OjA2OjEzLTA1OjAwNMgVqAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAx\
                Ni0wOS0xM1QxNDowNjoxMy0wNTowMEWVrRQAAAAASUVORK5CYII=" />\
                </svg> \
              </md-icon>\
              <a target="_blank" ng-href="{{$ctrl.fullTextLink}}">\
              {{ ::$ctrl.msg }}\
                <prm-icon external-link="" icon-type="svg" svg-icon-set="primo-ui" icon-definition="open-in-new"></prm-icon>\
              </a>\
            </span>'
  });

  /* END Primo VE HathiTrust Availability Add-On */

})();

(() => {
    const libchatHash = '1d73d9fc08accd85165ff98853a6f31d';
    const almaStr = `https://${location.hostname}/discovery/delivery/`; // indicates Alma viewer
    
    // Create style element and set its content
    const style = document.createElement('style');
    style.textContent = `
        #libchat_${libchatHash} button.libchat_online {
            border-radius: 0;
        }
        
        #libchat_modal_23785 {
            z-index: 100 !important;
        }

        .__xs ~ #libchat_${libchatHash} {
            display:none;
        }
    `;
    
    // Create script element for chat script
    const script = document.createElement('script');
    script.src = 'https://libanswers.calvin.edu/load_chat.php?hash=' + libchatHash;
    
    // Create div element for chat container
    const div = document.createElement('div');
    div.id = 'libchat_' + libchatHash;
    div.style.cssText = 'text-align: right; position:fixed; right: 0; bottom: 0;';
    
    // Append style, script, and div elements to the document body
    document.getElementsByTagName('body')[0].appendChild(style);
    document.getElementsByTagName('body')[0].appendChild(script);
    document.getElementsByTagName('body')[0].appendChild(div);
    
    setTimeout(() => {
        if (location.href.indexOf(almaStr) !== 0) {
            // don't include in Alma viewer
            document.getElementsByTagName('body')[0].appendChild(script);
        }
    }, 2000);
})();

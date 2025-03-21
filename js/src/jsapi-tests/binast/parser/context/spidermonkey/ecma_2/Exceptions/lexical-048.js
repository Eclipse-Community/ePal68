/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


/**
   File Name:          lexical-048.js
   Corresponds To:     7.8.1-1.js
   ECMA Section:       7.8.1 Rules of Automatic Semicolon Insertion
   Description:
   Author:             christine@netscape.com
   Date:               15 september 1997
*/

var SECTION = "lexical-048";
var VERSION = "JS1_4";
var TITLE   = "The Rules of Automatic Semicolon Insertion";

startTest();
writeHeaderToLog( SECTION + " "+ TITLE);

var result = "Failed";
var exception = "No exception thrown";
var expect = "Passed";

try {
  var counter = 0;
  eval( "for ( counter = 0;\ncounter <= 1\ncounter++ ) {\nresult += \": got inside for loop\")");
} catch ( e ) {
  result = expect;
  exception = e.toString();
}

new TestCase(
  SECTION,
  "line breaks within a for expression" +
  " (threw " + exception +")",
  expect,
  result );

test();

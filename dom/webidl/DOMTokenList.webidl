/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://dom.spec.whatwg.org/#interface-domtokenlist
 *
 * Copyright © 2012 W3C® (MIT, ERCIM, Keio), All Rights Reserved. W3C
 * liability, trademark and document use rules apply.
 */

[Exposed=Window]
interface DOMTokenList {
  [Pure]
  readonly attribute unsigned long length;
  [Pure]
  getter DOMString? item(unsigned long index);
  [Pure]
  boolean contains(DOMString token);
  [CEReactions, Throws]
  void add(DOMString... tokens);
  [CEReactions, Throws]
  void remove(DOMString... tokens);
  [CEReactions, Throws]
  boolean replace(DOMString token, DOMString newToken);
  [CEReactions, Throws]
  boolean toggle(DOMString token, optional boolean force);
  [Throws]
  boolean supports(DOMString token);
  [CEReactions, SetterThrows, Pure]
  stringifier attribute DOMString value;
  iterable<DOMString?>;
};

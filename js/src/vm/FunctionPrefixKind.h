/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef vm_FunctionPrefixKind_h
#define vm_FunctionPrefixKind_h

#include <stdint.h>  // uint8_t

namespace js {

enum class FunctionPrefixKind : uint8_t { None, Get, Set };

}  // namespace js

#endif /* vm_FunctionPrefixKind_h */

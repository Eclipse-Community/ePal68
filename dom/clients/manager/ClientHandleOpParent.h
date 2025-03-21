/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef _mozilla_dom_ClientHandleOpParent_h
#define _mozilla_dom_ClientHandleOpParent_h

#include "ClientOpPromise.h"
#include "mozilla/dom/PClientHandleOpParent.h"

namespace mozilla {
namespace dom {

class ClientSourceParent;

class ClientHandleOpParent final : public PClientHandleOpParent {
  MozPromiseRequestHolder<ClientOpPromise> mPromiseRequestHolder;

  ClientSourceParent* GetSource() const;

  // PClientHandleOpParent interface
  void ActorDestroy(ActorDestroyReason aReason) override;

 public:
  ClientHandleOpParent() = default;
  ~ClientHandleOpParent() = default;

  void Init(ClientOpConstructorArgs&& aArgs);
};

}  // namespace dom
}  // namespace mozilla

#endif  // _mozilla_dom_ClientHandleOpParent_h

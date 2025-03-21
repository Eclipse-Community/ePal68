/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/layers/APZCTreeManagerChild.h"

#include "InputData.h"                               // for InputData
#include "mozilla/dom/BrowserParent.h"               // for BrowserParent
#include "mozilla/layers/APZCCallbackHelper.h"       // for APZCCallbackHelper
#include "mozilla/layers/APZInputBridgeChild.h"      // for APZInputBridgeChild
#include "mozilla/layers/GeckoContentController.h"   // for GeckoContentController
#include "mozilla/layers/RemoteCompositorSession.h"  // for RemoteCompositorSession

namespace mozilla {
namespace layers {

APZCTreeManagerChild::APZCTreeManagerChild()
    : mCompositorSession(nullptr), mIPCOpen(false) {}

APZCTreeManagerChild::~APZCTreeManagerChild() = default;

void APZCTreeManagerChild::SetCompositorSession(
    RemoteCompositorSession* aSession) {
  // Exactly one of mCompositorSession and aSession must be null (i.e. either
  // we're setting mCompositorSession or we're clearing it).
  MOZ_ASSERT(!mCompositorSession ^ !aSession);
  mCompositorSession = aSession;
}

void APZCTreeManagerChild::SetInputBridge(APZInputBridgeChild* aInputBridge) {
  // The input bridge only exists from the UI process to the GPU process.
  MOZ_ASSERT(XRE_IsParentProcess());
  MOZ_ASSERT(!mInputBridge);

  mInputBridge = aInputBridge;
}

void APZCTreeManagerChild::Destroy() {
  MOZ_ASSERT(NS_IsMainThread());
  if (mInputBridge) {
    mInputBridge->Destroy();
    mInputBridge = nullptr;
  }
}

void APZCTreeManagerChild::SetKeyboardMap(const KeyboardMap& aKeyboardMap) {
  SendSetKeyboardMap(aKeyboardMap);
}

void APZCTreeManagerChild::ZoomToRect(const ScrollableLayerGuid& aGuid,
                                      const CSSRect& aRect,
                                      const uint32_t aFlags) {
  SendZoomToRect(aGuid, aRect, aFlags);
}

void APZCTreeManagerChild::ContentReceivedInputBlock(uint64_t aInputBlockId,
                                                     bool aPreventDefault) {
  SendContentReceivedInputBlock(aInputBlockId, aPreventDefault);
}

void APZCTreeManagerChild::SetTargetAPZC(
    uint64_t aInputBlockId, const nsTArray<ScrollableLayerGuid>& aTargets) {
  SendSetTargetAPZC(aInputBlockId, aTargets);
}

void APZCTreeManagerChild::UpdateZoomConstraints(
    const ScrollableLayerGuid& aGuid,
    const Maybe<ZoomConstraints>& aConstraints) {
  if (mIPCOpen) {
    SendUpdateZoomConstraints(aGuid, aConstraints);
  }
}

void APZCTreeManagerChild::SetDPI(float aDpiValue) { SendSetDPI(aDpiValue); }

void APZCTreeManagerChild::SetAllowedTouchBehavior(
    uint64_t aInputBlockId, const nsTArray<TouchBehaviorFlags>& aValues) {
  SendSetAllowedTouchBehavior(aInputBlockId, aValues);
}

void APZCTreeManagerChild::StartScrollbarDrag(
    const ScrollableLayerGuid& aGuid, const AsyncDragMetrics& aDragMetrics) {
  SendStartScrollbarDrag(aGuid, aDragMetrics);
}

bool APZCTreeManagerChild::StartAutoscroll(const ScrollableLayerGuid& aGuid,
                                           const ScreenPoint& aAnchorLocation) {
  return SendStartAutoscroll(aGuid, aAnchorLocation);
}

void APZCTreeManagerChild::StopAutoscroll(const ScrollableLayerGuid& aGuid) {
  SendStopAutoscroll(aGuid);
}

void APZCTreeManagerChild::SetLongTapEnabled(bool aTapGestureEnabled) {
  SendSetLongTapEnabled(aTapGestureEnabled);
}

APZInputBridge* APZCTreeManagerChild::InputBridge() {
  MOZ_ASSERT(XRE_IsParentProcess());
  MOZ_ASSERT(mInputBridge);

  return mInputBridge.get();
}

void APZCTreeManagerChild::AddIPDLReference() {
  MOZ_ASSERT(mIPCOpen == false);
  mIPCOpen = true;
  AddRef();
}

void APZCTreeManagerChild::ReleaseIPDLReference() {
  mIPCOpen = false;
  Release();
}

void APZCTreeManagerChild::ActorDestroy(ActorDestroyReason aWhy) {
  mIPCOpen = false;
}

mozilla::ipc::IPCResult APZCTreeManagerChild::RecvHandleTap(
    const TapType& aType, const LayoutDevicePoint& aPoint,
    const Modifiers& aModifiers, const ScrollableLayerGuid& aGuid,
    const uint64_t& aInputBlockId) {
  MOZ_ASSERT(XRE_IsParentProcess());
  if (mCompositorSession &&
      mCompositorSession->RootLayerTreeId() == aGuid.mLayersId &&
      mCompositorSession->GetContentController()) {
    RefPtr<GeckoContentController> controller =
        mCompositorSession->GetContentController();
    controller->HandleTap(aType, aPoint, aModifiers, aGuid, aInputBlockId);
    return IPC_OK();
  }
  dom::BrowserParent* tab =
      dom::BrowserParent::GetBrowserParentFromLayersId(aGuid.mLayersId);
  if (tab) {
    tab->SendHandleTap(aType, aPoint, aModifiers, aGuid, aInputBlockId);
  }
  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerChild::RecvNotifyPinchGesture(
    const PinchGestureType& aType, const ScrollableLayerGuid& aGuid,
    const LayoutDevicePoint& aFocusPoint, const LayoutDeviceCoord& aSpanChange,
    const Modifiers& aModifiers) {
  // This will only get sent from the GPU process to the parent process, so
  // this function should never get called in the content process.
  MOZ_ASSERT(XRE_IsParentProcess());
  MOZ_ASSERT(NS_IsMainThread());

  // We want to handle it in this process regardless of what the target guid
  // of the pinch is. This may change in the future.
  if (mCompositorSession && mCompositorSession->GetWidget()) {
    APZCCallbackHelper::NotifyPinchGesture(aType, aFocusPoint, aSpanChange,
                                           aModifiers,
                                           mCompositorSession->GetWidget());
  }
  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerChild::RecvCancelAutoscroll(
    const ScrollableLayerGuid::ViewID& aScrollId) {
  // This will only get sent from the GPU process to the parent process, so
  // this function should never get called in the content process.
  MOZ_ASSERT(XRE_IsParentProcess());
  MOZ_ASSERT(NS_IsMainThread());

  APZCCallbackHelper::CancelAutoscroll(aScrollId);
  return IPC_OK();
}

}  // namespace layers
}  // namespace mozilla

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_SVG_SVGANIMATEELEMENT_H_
#define DOM_SVG_SVGANIMATEELEMENT_H_

#include "mozilla/Attributes.h"
#include "mozilla/dom/SVGAnimationElement.h"
#include "mozilla/SMILAnimationFunction.h"

nsresult NS_NewSVGAnimateElement(
    nsIContent** aResult, already_AddRefed<mozilla::dom::NodeInfo>&& aNodeInfo);

namespace mozilla {
namespace dom {

class SVGAnimateElement final : public SVGAnimationElement {
 protected:
  explicit SVGAnimateElement(
      already_AddRefed<mozilla::dom::NodeInfo>&& aNodeInfo);

  SMILAnimationFunction mAnimationFunction;
  friend nsresult(::NS_NewSVGAnimateElement(
      nsIContent** aResult,
      already_AddRefed<mozilla::dom::NodeInfo>&& aNodeInfo));

  virtual JSObject* WrapNode(JSContext* aCx,
                             JS::Handle<JSObject*> aGivenProto) override;

 public:
  // nsINode
  virtual nsresult Clone(dom::NodeInfo*, nsINode** aResult) const override;

  // SVGAnimationElement
  virtual SMILAnimationFunction& AnimationFunction() override;
};

}  // namespace dom
}  // namespace mozilla

#endif  // DOM_SVG_SVGANIMATEELEMENT_H_

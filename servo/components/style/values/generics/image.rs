/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! Generic types for the handling of [images].
//!
//! [images]: https://drafts.csswg.org/css-images/#image-values

use crate::custom_properties;
use crate::values::serialize_atom_identifier;
use crate::Atom;
use servo_arc::Arc;
use std::fmt::{self, Write};
use style_traits::{CssWriter, ToCss};

/// An `<image> | none` value.
///
/// https://drafts.csswg.org/css-images/#image-values
#[derive(
    Clone, MallocSizeOf, PartialEq, SpecifiedValueInfo, ToComputedValue, ToResolvedValue, ToShmem,
)]
#[repr(C, u8)]
pub enum GenericImage<G, MozImageRect, ImageUrl, Color, Percentage, Resolution> {
    /// `none` variant.
    None,
    /// A `<url()>` image.
    Url(ImageUrl),

    /// A `<gradient>` image.  Gradients are rather large, and not nearly as
    /// common as urls, so we box them here to keep the size of this enum sane.
    Gradient(Box<G>),
    /// A `-moz-image-rect` image.  Also fairly large and rare.
    // not cfg’ed out on non-Gecko to avoid `error[E0392]: parameter `MozImageRect` is never used`
    // Instead we make MozImageRect an empty enum
    Rect(Box<MozImageRect>),

    /// A `-moz-element(# <element-id>)`
    #[cfg(feature = "gecko")]
    #[css(function = "-moz-element")]
    Element(Atom),

    /// A paint worklet image.
    /// <https://drafts.css-houdini.org/css-paint-api/>
    #[cfg(feature = "servo-layout-2013")]
    PaintWorklet(PaintWorklet),

    /// A `<cross-fade()>` image. Storing this directly inside of
    /// GenericImage increases the size by 8 bytes so we box it here
    /// and store images directly inside of cross-fade instead of
    /// boxing them there.
    CrossFade(Box<GenericCrossFade<Self, Color, Percentage>>),

    /// An `image-set()` function.
    ImageSet(#[compute(field_bound)] Box<GenericImageSet<Self, Resolution>>),
}

pub use self::GenericImage as Image;

/// <https://drafts.csswg.org/css-images-4/#cross-fade-function>
#[derive(
    Clone, Debug, MallocSizeOf, PartialEq, ToResolvedValue, ToShmem, ToCss, ToComputedValue,
)]
#[css(comma, function = "cross-fade")]
#[repr(C)]
pub struct GenericCrossFade<Image, Color, Percentage> {
    /// All of the image percent pairings passed as arguments to
    /// cross-fade.
    #[css(iterable)]
    pub elements: crate::OwnedSlice<GenericCrossFadeElement<Image, Color, Percentage>>,
}

/// A `<percent> | none` value. Represents optional percentage values
/// assosicated with cross-fade images.
#[derive(
    Clone, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToResolvedValue, ToShmem, ToCss,
)]
#[repr(C, u8)]
pub enum PercentOrNone<Percentage> {
    /// `none` variant.
    #[css(skip)]
    None,
    /// A percentage variant.
    Percent(Percentage),
}

/// An optional percent and a cross fade image.
#[derive(
    Clone, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToResolvedValue, ToShmem, ToCss,
)]
#[repr(C)]
pub struct GenericCrossFadeElement<Image, Color, Percentage> {
    /// The percent of the final image that `image` will be.
    pub percent: PercentOrNone<Percentage>,
    /// A color or image that will be blended when cross-fade is
    /// evaluated.
    pub image: GenericCrossFadeImage<Image, Color>,
}

/// An image or a color. `cross-fade` takes either when blending
/// images together.
#[derive(
    Clone, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToResolvedValue, ToShmem, ToCss,
)]
#[repr(C, u8)]
pub enum GenericCrossFadeImage<I, C> {
    /// A boxed image value. Boxing provides indirection so images can
    /// be cross-fades and cross-fades can be images.
    Image(I),
    /// A color value.
    Color(C),
}

pub use self::GenericCrossFade as CrossFade;
pub use self::GenericCrossFadeElement as CrossFadeElement;
pub use self::GenericCrossFadeImage as CrossFadeImage;

/// https://drafts.csswg.org/css-images-4/#image-set-notation
#[derive(Clone, Debug, MallocSizeOf, PartialEq, ToCss, ToResolvedValue, ToShmem)]
#[css(comma, function = "image-set")]
#[repr(C)]
pub struct GenericImageSet<Image, Resolution> {
    /// The index of the selected candidate. Zero for specified values.
    #[css(skip)]
    pub selected_index: usize,

    /// All of the image and resolution pairs.
    #[css(iterable)]
    pub items: crate::OwnedSlice<GenericImageSetItem<Image, Resolution>>,
}

/// An optional percent and a cross fade image.
#[derive(
    Clone, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToResolvedValue, ToShmem,
)]
#[repr(C)]
pub struct GenericImageSetItem<Image, Resolution> {
    /// `<image>`. `<string>` is converted to `Image::Url` at parse time.
    pub image: Image,
    /// The `<resolution>`.
    ///
    /// TODO: Skip serialization if it is 1x.
    pub resolution: Resolution,

    /// The `type(<string>)`
    /// (Optional) Specify the image's MIME type
    pub mime_type: crate::OwnedStr,

    /// True if mime_type has been specified
    pub has_mime_type: bool,
}

impl<I: style_traits::ToCss, R: style_traits::ToCss> ToCss for GenericImageSetItem<I, R>
{
    fn to_css<W>(&self, dest: &mut CssWriter<W>) -> fmt::Result
    where
        W: fmt::Write,
    {
        self.image.to_css(dest)?;
        dest.write_str(" ")?;
        self.resolution.to_css(dest)?;

        if self.has_mime_type {
            dest.write_str(" ")?;
            dest.write_str("type(")?;
            self.mime_type.to_css(dest)?;
            dest.write_str(")")?;
        }
        Ok(())
    }
}

pub use self::GenericImageSet as ImageSet;
pub use self::GenericImageSetItem as ImageSetItem;

/// A CSS gradient.
/// <https://drafts.csswg.org/css-images/#gradients>
#[derive(Clone, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToResolvedValue, ToShmem)]
#[repr(C)]
pub struct GenericGradient<
    LineDirection,
    LengthPercentage,
    NonNegativeLength,
    NonNegativeLengthPercentage,
    Position,
    Color,
> {
    /// Gradients can be linear or radial.
    pub kind: GenericGradientKind<
        LineDirection,
        NonNegativeLength,
        NonNegativeLengthPercentage,
        Position,
    >,
    /// The color stops and interpolation hints.
    pub items: crate::OwnedSlice<GenericGradientItem<Color, LengthPercentage>>,
    /// True if this is a repeating gradient.
    pub repeating: bool,
    /// Compatibility mode.
    pub compat_mode: GradientCompatMode,
}

pub use self::GenericGradient as Gradient;

#[derive(
    Clone, Copy, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToResolvedValue, ToShmem,
)]
#[repr(u8)]
/// Whether we used the modern notation or the compatibility `-webkit`, `-moz` prefixes.
pub enum GradientCompatMode {
    /// Modern syntax.
    Modern,
    /// `-webkit` prefix.
    WebKit,
    /// `-moz` prefix
    Moz,
}

/// A gradient kind.
#[derive(Clone, Copy, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToResolvedValue, ToShmem)]
#[repr(C, u8)]
pub enum GenericGradientKind<
    LineDirection,
    NonNegativeLength,
    NonNegativeLengthPercentage,
    Position,
> {
    /// A linear gradient.
    Linear(LineDirection),
    /// A radial gradient.
    Radial(
        GenericEndingShape<NonNegativeLength, NonNegativeLengthPercentage>,
        Position,
    ),
}

pub use self::GenericGradientKind as GradientKind;

/// A radial gradient's ending shape.
#[derive(
    Clone, Copy, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToCss, ToResolvedValue, ToShmem,
)]
#[repr(C, u8)]
pub enum GenericEndingShape<NonNegativeLength, NonNegativeLengthPercentage> {
    /// A circular gradient.
    Circle(GenericCircle<NonNegativeLength>),
    /// An elliptic gradient.
    Ellipse(GenericEllipse<NonNegativeLengthPercentage>),
}

pub use self::GenericEndingShape as EndingShape;

/// A circle shape.
#[derive(
    Clone, Copy, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToResolvedValue, ToShmem,
)]
#[repr(C, u8)]
pub enum GenericCircle<NonNegativeLength> {
    /// A circle radius.
    Radius(NonNegativeLength),
    /// A circle extent.
    Extent(ShapeExtent),
}

pub use self::GenericCircle as Circle;

/// An ellipse shape.
#[derive(
    Clone, Copy, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToCss, ToResolvedValue, ToShmem,
)]
#[repr(C, u8)]
pub enum GenericEllipse<NonNegativeLengthPercentage> {
    /// An ellipse pair of radii.
    Radii(NonNegativeLengthPercentage, NonNegativeLengthPercentage),
    /// An ellipse extent.
    Extent(ShapeExtent),
}

pub use self::GenericEllipse as Ellipse;

/// <https://drafts.csswg.org/css-images/#typedef-extent-keyword>
#[allow(missing_docs)]
#[cfg_attr(feature = "servo", derive(Deserialize, Serialize))]
#[derive(
    Clone,
    Copy,
    Debug,
    Eq,
    MallocSizeOf,
    Parse,
    PartialEq,
    ToComputedValue,
    ToCss,
    ToResolvedValue,
    ToShmem,
)]
#[repr(u8)]
pub enum ShapeExtent {
    ClosestSide,
    FarthestSide,
    ClosestCorner,
    FarthestCorner,
    Contain,
    Cover,
}

/// A gradient item.
/// <https://drafts.csswg.org/css-images-4/#color-stop-syntax>
#[derive(
    Clone, Copy, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToCss, ToResolvedValue, ToShmem,
)]
#[repr(C, u8)]
pub enum GenericGradientItem<Color, T> {
    /// A simple color stop, without position.
    SimpleColorStop(Color),
    /// A complex color stop, with a position.
    ComplexColorStop {
        /// The color for the stop.
        color: Color,
        /// The position for the stop.
        position: T,
    },
    /// An interpolation hint.
    InterpolationHint(T),
}

pub use self::GenericGradientItem as GradientItem;

/// A color stop.
/// <https://drafts.csswg.org/css-images/#typedef-color-stop-list>
#[derive(
    Clone, Copy, Debug, MallocSizeOf, PartialEq, ToComputedValue, ToCss, ToResolvedValue, ToShmem,
)]
pub struct ColorStop<Color, T> {
    /// The color of this stop.
    pub color: Color,
    /// The position of this stop.
    pub position: Option<T>,
}

impl<Color, T> ColorStop<Color, T> {
    /// Convert the color stop into an appropriate `GradientItem`.
    #[inline]
    pub fn into_item(self) -> GradientItem<Color, T> {
        match self.position {
            Some(position) => GradientItem::ComplexColorStop {
                color: self.color,
                position,
            },
            None => GradientItem::SimpleColorStop(self.color),
        }
    }
}

/// Specified values for a paint worklet.
/// <https://drafts.css-houdini.org/css-paint-api/>
#[cfg_attr(feature = "servo", derive(MallocSizeOf))]
#[derive(Clone, Debug, PartialEq, ToComputedValue, ToResolvedValue, ToShmem)]
pub struct PaintWorklet {
    /// The name the worklet was registered with.
    pub name: Atom,
    /// The arguments for the worklet.
    /// TODO: store a parsed representation of the arguments.
    #[cfg_attr(feature = "servo", ignore_malloc_size_of = "Arc")]
    #[compute(no_field_bound)]
    #[resolve(no_field_bound)]
    pub arguments: Vec<Arc<custom_properties::SpecifiedValue>>,
}

impl ::style_traits::SpecifiedValueInfo for PaintWorklet {}

impl ToCss for PaintWorklet {
    fn to_css<W>(&self, dest: &mut CssWriter<W>) -> fmt::Result
    where
        W: Write,
    {
        dest.write_str("paint(")?;
        serialize_atom_identifier(&self.name, dest)?;
        for argument in &self.arguments {
            dest.write_str(", ")?;
            argument.to_css(dest)?;
        }
        dest.write_str(")")
    }
}

/// Values for `moz-image-rect`.
///
/// `-moz-image-rect(<uri>, top, right, bottom, left);`
#[allow(missing_docs)]
#[derive(
    Clone,
    Debug,
    MallocSizeOf,
    PartialEq,
    SpecifiedValueInfo,
    ToComputedValue,
    ToCss,
    ToResolvedValue,
    ToShmem,
)]
#[css(comma, function = "-moz-image-rect")]
#[repr(C)]
pub struct GenericMozImageRect<NumberOrPercentage, MozImageRectUrl> {
    pub url: MozImageRectUrl,
    pub top: NumberOrPercentage,
    pub right: NumberOrPercentage,
    pub bottom: NumberOrPercentage,
    pub left: NumberOrPercentage,
}

pub use self::GenericMozImageRect as MozImageRect;

impl<G, R, U, C, P, Resolution> fmt::Debug for Image<G, R, U, C, P, Resolution>
where
    Image<G, R, U, C, P, Resolution>: ToCss,
{
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        self.to_css(&mut CssWriter::new(f))
    }
}

impl<G, R, U, C, P, Resolution> ToCss for Image<G, R, U, C, P, Resolution>
where
    G: ToCss,
    R: ToCss,
    U: ToCss,
    C: ToCss,
    P: ToCss,
    Resolution: ToCss,
{
    fn to_css<W>(&self, dest: &mut CssWriter<W>) -> fmt::Result
    where
        W: Write,
    {
        match *self {
            Image::None => dest.write_str("none"),
            Image::Url(ref url) => url.to_css(dest),
            Image::Gradient(ref gradient) => gradient.to_css(dest),
            Image::Rect(ref rect) => rect.to_css(dest),
            #[cfg(feature = "servo-layout-2013")]
            Image::PaintWorklet(ref paint_worklet) => paint_worklet.to_css(dest),
            #[cfg(feature = "gecko")]
            Image::Element(ref selector) => {
                dest.write_str("-moz-element(#")?;
                serialize_atom_identifier(selector, dest)?;
                dest.write_str(")")
            },
            Image::ImageSet(ref is) => is.to_css(dest),
            Image::CrossFade(ref cf) => cf.to_css(dest),
        }
    }
}

impl<D, LP, NL, NLP, P, C> ToCss for Gradient<D, LP, NL, NLP, P, C>
where
    D: LineDirection,
    LP: ToCss,
    NL: ToCss,
    NLP: ToCss,
    P: ToCss,
    C: ToCss,
{
    fn to_css<W>(&self, dest: &mut CssWriter<W>) -> fmt::Result
    where
        W: Write,
    {
        match self.compat_mode {
            GradientCompatMode::WebKit => dest.write_str("-webkit-")?,
            GradientCompatMode::Moz => dest.write_str("-moz-")?,
            _ => {},
        }

        if self.repeating {
            dest.write_str("repeating-")?;
        }
        dest.write_str(self.kind.label())?;
        dest.write_str("-gradient(")?;
        let mut skip_comma = match self.kind {
            GradientKind::Linear(ref direction) if direction.points_downwards(self.compat_mode) => {
                true
            },
            GradientKind::Linear(ref direction) => {
                direction.to_css(dest, self.compat_mode)?;
                false
            },
            GradientKind::Radial(ref shape, ref position) => {
                let omit_shape = match *shape {
                    EndingShape::Ellipse(Ellipse::Extent(ShapeExtent::Cover)) |
                    EndingShape::Ellipse(Ellipse::Extent(ShapeExtent::FarthestCorner)) => true,
                    _ => false,
                };
                if self.compat_mode == GradientCompatMode::Modern {
                    if !omit_shape {
                        shape.to_css(dest)?;
                        dest.write_str(" ")?;
                    }
                    dest.write_str("at ")?;
                    position.to_css(dest)?;
                } else {
                    position.to_css(dest)?;
                    if !omit_shape {
                        dest.write_str(", ")?;
                        shape.to_css(dest)?;
                    }
                }
                false
            },
        };
        for item in &*self.items {
            if !skip_comma {
                dest.write_str(", ")?;
            }
            skip_comma = false;
            item.to_css(dest)?;
        }
        dest.write_str(")")
    }
}

impl<D, L, LoP, P> GradientKind<D, L, LoP, P> {
    fn label(&self) -> &str {
        match *self {
            GradientKind::Linear(..) => "linear",
            GradientKind::Radial(..) => "radial",
        }
    }
}

/// The direction of a linear gradient.
pub trait LineDirection {
    /// Whether this direction points towards, and thus can be omitted.
    fn points_downwards(&self, compat_mode: GradientCompatMode) -> bool;

    /// Serialises this direction according to the compatibility mode.
    fn to_css<W>(&self, dest: &mut CssWriter<W>, compat_mode: GradientCompatMode) -> fmt::Result
    where
        W: Write;
}

impl<L> ToCss for Circle<L>
where
    L: ToCss,
{
    fn to_css<W>(&self, dest: &mut CssWriter<W>) -> fmt::Result
    where
        W: Write,
    {
        match *self {
            Circle::Extent(ShapeExtent::FarthestCorner) | Circle::Extent(ShapeExtent::Cover) => {
                dest.write_str("circle")
            },
            Circle::Extent(keyword) => {
                dest.write_str("circle ")?;
                keyword.to_css(dest)
            },
            Circle::Radius(ref length) => length.to_css(dest),
        }
    }
}

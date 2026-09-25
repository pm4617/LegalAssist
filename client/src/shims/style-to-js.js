import styleToObject from 'style-to-object';

const CUSTOM_PROPERTY_REGEX = /^--[a-zA-Z0-9_-]+$/;
const HYPHEN_REGEX = /-([a-z])/g;
const NO_HYPHEN_REGEX = /^[^-]+$/;
const VENDOR_PREFIX_REGEX = /^-(webkit|moz|ms|o|khtml)-/;
const MS_VENDOR_PREFIX_REGEX = /^-(ms)-/;

const skipCamelCase = (property) => {
  return (
    !property ||
    NO_HYPHEN_REGEX.test(property) ||
    CUSTOM_PROPERTY_REGEX.test(property)
  );
};

const capitalize = (_, character) => character.toUpperCase();
const trimHyphen = (_, prefix) => `${prefix}-`;

export const camelCase = (property, options = {}) => {
  if (skipCamelCase(property)) {
    return property;
  }
  property = property.toLowerCase();
  if (options.reactCompat) {
    property = property.replace(MS_VENDOR_PREFIX_REGEX, trimHyphen);
  } else {
    property = property.replace(VENDOR_PREFIX_REGEX, trimHyphen);
  }
  return property.replace(HYPHEN_REGEX, capitalize);
};

export default function styleToJS(style, options) {
  const output = {};
  if (!style || typeof style !== 'string') {
    return output;
  }
  const parse = typeof styleToObject === 'function' ? styleToObject : styleToObject.default;
  if (typeof parse === 'function') {
    parse(style, (property, value) => {
      if (property && value) {
        output[camelCase(property, options)] = value;
      }
    });
  }
  return output;
}

styleToJS.default = styleToJS;
styleToJS.camelCase = camelCase;

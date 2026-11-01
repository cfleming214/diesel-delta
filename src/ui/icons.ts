/* eslint-disable @typescript-eslint/no-require-imports */
// Icons are loaded one file each: the package's index pulls in all ~1,500 icons (about 6 MB of
// JavaScript) because Metro does not tree-shake. The per-icon files are untyped TSX source, so they
// are required and given the package's public Icon type. Add new icons here, not from
// 'phosphor-react-native'.
import type { Icon } from 'phosphor-react-native';

export type { Icon, IconWeight } from 'phosphor-react-native';

export const Barcode: Icon = require('phosphor-react-native/src/icons/Barcode').BarcodeIcon;
export const Basket: Icon = require('phosphor-react-native/src/icons/Basket').BasketIcon;
export const BookOpen: Icon = require('phosphor-react-native/src/icons/BookOpen').BookOpenIcon;
export const Camera: Icon = require('phosphor-react-native/src/icons/Camera').CameraIcon;
export const CaretDown: Icon = require('phosphor-react-native/src/icons/CaretDown').CaretDownIcon;
export const CaretLeft: Icon = require('phosphor-react-native/src/icons/CaretLeft').CaretLeftIcon;
export const CaretRight: Icon =
  require('phosphor-react-native/src/icons/CaretRight').CaretRightIcon;
export const CaretUp: Icon = require('phosphor-react-native/src/icons/CaretUp').CaretUpIcon;
export const ChartBar: Icon = require('phosphor-react-native/src/icons/ChartBar').ChartBarIcon;
export const Check: Icon = require('phosphor-react-native/src/icons/Check').CheckIcon;
export const CheckCircle: Icon =
  require('phosphor-react-native/src/icons/CheckCircle').CheckCircleIcon;
export const CheckSquare: Icon =
  require('phosphor-react-native/src/icons/CheckSquare').CheckSquareIcon;
export const DotsSixVertical: Icon =
  require('phosphor-react-native/src/icons/DotsSixVertical').DotsSixVerticalIcon;
export const DownloadSimple: Icon =
  require('phosphor-react-native/src/icons/DownloadSimple').DownloadSimpleIcon;
export const GasPump: Icon = require('phosphor-react-native/src/icons/GasPump').GasPumpIcon;
export const Gauge: Icon = require('phosphor-react-native/src/icons/Gauge').GaugeIcon;
export const Info: Icon = require('phosphor-react-native/src/icons/Info').InfoIcon;
export const Link: Icon = require('phosphor-react-native/src/icons/Link').LinkIcon;
export const MagnifyingGlass: Icon =
  require('phosphor-react-native/src/icons/MagnifyingGlass').MagnifyingGlassIcon;
export const MapPin: Icon = require('phosphor-react-native/src/icons/MapPin').MapPinIcon;
export const Minus: Icon = require('phosphor-react-native/src/icons/Minus').MinusIcon;
export const MinusCircle: Icon =
  require('phosphor-react-native/src/icons/MinusCircle').MinusCircleIcon;
export const PencilSimple: Icon =
  require('phosphor-react-native/src/icons/PencilSimple').PencilSimpleIcon;
export const Pause: Icon = require('phosphor-react-native/src/icons/Pause').PauseIcon;
export const Play: Icon = require('phosphor-react-native/src/icons/Play').PlayIcon;
export const Plus: Icon = require('phosphor-react-native/src/icons/Plus').PlusIcon;
export const Receipt: Icon = require('phosphor-react-native/src/icons/Receipt').ReceiptIcon;
export const ShareNetwork: Icon =
  require('phosphor-react-native/src/icons/ShareNetwork').ShareNetworkIcon;
export const Square: Icon = require('phosphor-react-native/src/icons/Square').SquareIcon;
export const Star: Icon = require('phosphor-react-native/src/icons/Star').StarIcon;
export const StarFour: Icon = require('phosphor-react-native/src/icons/StarFour').StarFourIcon;
export const Storefront: Icon =
  require('phosphor-react-native/src/icons/Storefront').StorefrontIcon;
export const TrendDown: Icon = require('phosphor-react-native/src/icons/TrendDown').TrendDownIcon;
export const TrendUp: Icon = require('phosphor-react-native/src/icons/TrendUp').TrendUpIcon;
export const X: Icon = require('phosphor-react-native/src/icons/X').XIcon;

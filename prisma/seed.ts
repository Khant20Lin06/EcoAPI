// @ts-nocheck

import {
  FulfillmentType,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
  ProductStatus,
  ReturnRequestStatus,
  Role,
  VendorLedgerEntryType,
  VendorPayoutBatchStatus,
  VendorPayoutItemStatus,
  VendorStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'change-me';
const SEED_PREFIX = 'seed_';
const RNG_SEED = 20260217;
const DATE_WINDOW_DAYS = 90;
const STOCK_RESERVATION_MINUTES = 15;
const MS_IN_MINUTE = 60 * 1000;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const targets = {
  user: new Set<string>(),
  vendor: new Set<string>(),
  vendorMember: new Set<string>(),
  category: new Set<string>(),
  sustainabilityTag: new Set<string>(),
  product: new Set<string>(),
  productVariant: new Set<string>(),
  productImage: new Set<string>(),
  productTag: new Set<string>(),
  address: new Set<string>(),
  cart: new Set<string>(),
  cartItem: new Set<string>(),
  order: new Set<string>(),
  orderItem: new Set<string>(),
  payment: new Set<string>(),
  returnRequest: new Set<string>(),
  review: new Set<string>(),
  promotion: new Set<string>(),
  blogPost: new Set<string>(),
  pickupLocation: new Set<string>(),
  shippingRate: new Set<string>(),
  chatThread: new Set<string>(),
  chatMessage: new Set<string>(),
  chatReadState: new Set<string>(),
  notification: new Set<string>(),
  notificationDelivery: new Set<string>(),
  vendorLedgerEntry: new Set<string>(),
  vendorPayoutBatch: new Set<string>(),
  vendorPayoutItem: new Set<string>(),
  refreshToken: new Set<string>(),
  emailVerificationToken: new Set<string>(),
} as const;

type TargetKey = keyof typeof targets;

type SeedUser = {
  id: string;
  email: string;
  role: Role;
  locale: string;
  phone: string | null;
};

type SeedVendor = {
  id: string;
  ownerUserId: string;
  name: string;
  country: 'US' | 'MM';
  currency: 'USD' | 'MMK';
  status: VendorStatus;
  commissionPct: number;
};

type SeedCategory = {
  key: string;
  id: string;
  en_name: string;
  mm_name: string;
  slug: string;
  parentKey: string | null;
};

type SeedTag = {
  id: string;
  en_name: string;
  mm_name: string;
  slug: string;
  description: string;
};

type SeedVariant = {
  id: string;
  productId: string;
  vendorId: string;
  currency: 'USD' | 'MMK';
  price: number;
  baseStockQty: number;
};

type SeedShippingRate = {
  id: string;
  vendorId: string;
  country: 'US' | 'MM';
  flatRate: number;
  currency: 'USD' | 'MMK';
};

type SeedOrderItemMeta = {
  id: string;
  orderId: string;
  variantId: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  orderStatus: OrderStatus;
};

type SeedOrderMeta = {
  id: string;
  userId: string;
  vendorId: string;
  status: OrderStatus;
  fulfillment: FulfillmentType;
  currency: 'USD' | 'MMK';
  total: number;
  createdAt: Date;
};

type SeedPaymentMeta = {
  id: string;
  orderId: string;
  vendorId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: number;
  currency: string;
  providerRef: string;
  createdAt: Date;
};

type SeedReturnMeta = {
  id: string;
  orderId: string;
  status: ReturnRequestStatus;
  requestedAt: Date;
};

type SeedNotificationMeta = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: Prisma.InputJsonValue;
  readAt: Date | null;
  createdAt: Date;
};

function track(target: TargetKey, id: string) {
  targets[target].add(id);
}

function seededId(...parts: Array<string | number>) {
  return `${SEED_PREFIX}${parts
    .map((part) => String(part))
    .join('_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase()}`;
}

function pad(value: number, width: number) {
  return String(value).padStart(width, '0');
}

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickOne<T>(rng: () => number, values: T[]) {
  return values[randomInt(rng, 0, values.length - 1)];
}

function shuffle<T>(rng: () => number, values: T[]) {
  const cloned = [...values];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, 0, i);
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function randomPastDate(rng: () => number, now: Date, dayWindow = DATE_WINDOW_DAYS) {
  const offsetMinutes = randomInt(rng, 0, dayWindow * 24 * 60);
  return new Date(now.getTime() - offsetMinutes * MS_IN_MINUTE);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * MS_IN_MINUTE);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * MS_IN_DAY);
}

function staleSeedIdFilter(keepIds: Set<string>): Prisma.StringFilter {
  const keep = [...keepIds];
  if (keep.length === 0) {
    return { startsWith: SEED_PREFIX };
  }
  return { startsWith: SEED_PREFIX, notIn: keep };
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function incrementMapValue(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function getOrderStatusPlan(rng: () => number) {
  const statuses = [
    ...Array(10).fill(OrderStatus.PENDING_PAYMENT),
    ...Array(12).fill(OrderStatus.PAID),
    ...Array(8).fill(OrderStatus.PROCESSING),
    ...Array(5).fill(OrderStatus.PACKED),
    ...Array(4).fill(OrderStatus.SHIPPED),
    ...Array(3).fill(OrderStatus.READY_FOR_PICKUP),
    ...Array(7).fill(OrderStatus.DELIVERED),
    ...Array(4).fill(OrderStatus.PICKED_UP),
    ...Array(2).fill(OrderStatus.RETURN_REQUESTED),
    ...Array(1).fill(OrderStatus.RETURN_APPROVED),
    ...Array(1).fill(OrderStatus.RETURNED),
    ...Array(2).fill(OrderStatus.REFUNDED),
    ...Array(1).fill(OrderStatus.CANCELED),
  ];
  return shuffle(rng, statuses);
}

function getPeriodStartUtc(now: Date) {
  const utcDay = now.getUTCDay();
  const daysFromMonday = (utcDay + 6) % 7;
  const midnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return addDays(midnightUtc, -daysFromMonday - 7);
}

async function upsertSeedUser(input: {
  id: string;
  email: string;
  role: Role;
  locale: string;
  phone: string | null;
  passwordHash: string;
  emailVerifiedAt: Date;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    const updated = await prisma.user.update({
      where: { email: input.email },
      data: {
        role: input.role,
        passwordHash: input.passwordHash,
        locale: input.locale,
        phone: input.phone,
        emailVerifiedAt: input.emailVerifiedAt,
      },
    });
    track('user', updated.id);
    return updated;
  }

  const created = await prisma.user.create({
    data: {
      id: input.id,
      email: input.email,
      role: input.role,
      passwordHash: input.passwordHash,
      locale: input.locale,
      phone: input.phone,
      emailVerifiedAt: input.emailVerifiedAt,
    },
  });
  track('user', created.id);
  return created;
}

async function cleanupStaleSeedRows() {
  await prisma.notificationDelivery.deleteMany({
    where: { id: staleSeedIdFilter(targets.notificationDelivery) },
  });
  await prisma.notification.deleteMany({
    where: { id: staleSeedIdFilter(targets.notification) },
  });
  await prisma.chatReadState.deleteMany({
    where: { id: staleSeedIdFilter(targets.chatReadState) },
  });
  await prisma.chatMessage.deleteMany({
    where: { id: staleSeedIdFilter(targets.chatMessage) },
  });
  await prisma.chatThread.deleteMany({
    where: { id: staleSeedIdFilter(targets.chatThread) },
  });
  await prisma.review.deleteMany({
    where: { id: staleSeedIdFilter(targets.review) },
  });
  await prisma.returnRequest.deleteMany({
    where: { id: staleSeedIdFilter(targets.returnRequest) },
  });
  await prisma.vendorLedgerEntry.deleteMany({
    where: { id: staleSeedIdFilter(targets.vendorLedgerEntry) },
  });
  await prisma.payment.deleteMany({
    where: { id: staleSeedIdFilter(targets.payment) },
  });
  await prisma.orderItem.deleteMany({
    where: { id: staleSeedIdFilter(targets.orderItem) },
  });
  await prisma.order.deleteMany({
    where: { id: staleSeedIdFilter(targets.order) },
  });
  await prisma.cartItem.deleteMany({
    where: { id: staleSeedIdFilter(targets.cartItem) },
  });
  await prisma.cart.deleteMany({
    where: { id: staleSeedIdFilter(targets.cart) },
  });
  await prisma.vendorPayoutItem.deleteMany({
    where: { id: staleSeedIdFilter(targets.vendorPayoutItem) },
  });
  await prisma.vendorPayoutBatch.deleteMany({
    where: { id: staleSeedIdFilter(targets.vendorPayoutBatch) },
  });
  await prisma.promotion.deleteMany({
    where: { id: staleSeedIdFilter(targets.promotion) },
  });
  await prisma.blogPost.deleteMany({
    where: { id: staleSeedIdFilter(targets.blogPost) },
  });
  await prisma.productImage.deleteMany({
    where: { id: staleSeedIdFilter(targets.productImage) },
  });
  await prisma.productTag.deleteMany({
    where: { id: staleSeedIdFilter(targets.productTag) },
  });
  await prisma.productVariant.deleteMany({
    where: { id: staleSeedIdFilter(targets.productVariant) },
  });
  await prisma.product.deleteMany({
    where: { id: staleSeedIdFilter(targets.product) },
  });
  await prisma.shippingRate.deleteMany({
    where: { id: staleSeedIdFilter(targets.shippingRate) },
  });
  await prisma.pickupLocation.deleteMany({
    where: { id: staleSeedIdFilter(targets.pickupLocation) },
  });
  await prisma.address.deleteMany({
    where: { id: staleSeedIdFilter(targets.address) },
  });
  await prisma.vendorMember.deleteMany({
    where: { id: staleSeedIdFilter(targets.vendorMember) },
  });
  await prisma.vendor.deleteMany({
    where: { id: staleSeedIdFilter(targets.vendor) },
  });
  await prisma.sustainabilityTag.deleteMany({
    where: { id: staleSeedIdFilter(targets.sustainabilityTag) },
  });
  await prisma.category.deleteMany({
    where: { id: staleSeedIdFilter(targets.category) },
  });
  await prisma.refreshToken.deleteMany({
    where: { id: staleSeedIdFilter(targets.refreshToken) },
  });
  await prisma.emailVerificationToken.deleteMany({
    where: { id: staleSeedIdFilter(targets.emailVerificationToken) },
  });
  await prisma.user.deleteMany({
    where: { id: staleSeedIdFilter(targets.user) },
  });
}

async function main() {
  const rng = createRng(RNG_SEED);
  const now = new Date();
  const verifiedAt = addDays(now, -1);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const userLocaleById = new Map<string, string>();
  const vendorOwnerByVendorId = new Map<string, string>();
  const customerUsers: SeedUser[] = [];
  const vendors: SeedVendor[] = [];
  const approvedVendors: SeedVendor[] = [];

  const adminUser = await upsertSeedUser({
    id: seededId('user', 'admin'),
    email: 'admin@eco.local',
    role: Role.ADMIN,
    locale: 'en',
    phone: '+1-800-100-0000',
    passwordHash,
    emailVerifiedAt: verifiedAt,
  });
  userLocaleById.set(adminUser.id, 'en');

  const vendorBlueprints: Array<{
    index: number;
    status: VendorStatus;
    country: 'US' | 'MM';
    currency: 'USD' | 'MMK';
    commissionPct: number;
    name: string;
  }> = [
    {
      index: 1,
      status: VendorStatus.APPROVED,
      country: 'US',
      currency: 'USD',
      commissionPct: 10,
      name: 'Green Harbor Store',
    },
    {
      index: 2,
      status: VendorStatus.APPROVED,
      country: 'US',
      currency: 'USD',
      commissionPct: 9,
      name: 'Earthwise Goods',
    },
    {
      index: 3,
      status: VendorStatus.APPROVED,
      country: 'MM',
      currency: 'MMK',
      commissionPct: 11,
      name: 'Yangon Eco Mart',
    },
    {
      index: 4,
      status: VendorStatus.APPROVED,
      country: 'MM',
      currency: 'MMK',
      commissionPct: 10,
      name: 'Mandalay Green Hub',
    },
    {
      index: 5,
      status: VendorStatus.APPROVED,
      country: 'US',
      currency: 'USD',
      commissionPct: 12,
      name: 'Pure Planet Shop',
    },
    {
      index: 6,
      status: VendorStatus.PENDING,
      country: 'MM',
      currency: 'MMK',
      commissionPct: 10,
      name: 'Eco Lotus Pending',
    },
    {
      index: 7,
      status: VendorStatus.PENDING,
      country: 'US',
      currency: 'USD',
      commissionPct: 10,
      name: 'Blue Ridge Eco Pending',
    },
    {
      index: 8,
      status: VendorStatus.SUSPENDED,
      country: 'MM',
      currency: 'MMK',
      commissionPct: 8,
      name: 'Suspended Green Outlet',
    },
  ];

  for (const blueprint of vendorBlueprints) {
    const vendorUser = await upsertSeedUser({
      id: seededId('user', 'vendor', pad(blueprint.index, 2)),
      email: `vendor${blueprint.index}@eco.local`,
      role: Role.VENDOR,
      locale: blueprint.country === 'MM' ? 'my' : 'en',
      phone:
        blueprint.country === 'MM'
          ? `+95-9-7777-10${blueprint.index}`
          : `+1-555-200-${pad(blueprint.index, 4)}`,
      passwordHash,
      emailVerifiedAt: verifiedAt,
    });

    userLocaleById.set(vendorUser.id, vendorUser.locale);

    const vendorId = seededId('vendor', pad(blueprint.index, 2));
    const vendor = await prisma.vendor.upsert({
      where: { id: vendorId },
      update: {
        ownerUserId: vendorUser.id,
        status: blueprint.status,
        name: blueprint.name,
        country: blueprint.country,
        currency: blueprint.currency,
        commissionPct: blueprint.commissionPct,
      },
      create: {
        id: vendorId,
        ownerUserId: vendorUser.id,
        status: blueprint.status,
        name: blueprint.name,
        country: blueprint.country,
        currency: blueprint.currency,
        commissionPct: blueprint.commissionPct,
      },
    });
    track('vendor', vendor.id);
    vendorOwnerByVendorId.set(vendor.id, vendorUser.id);

    const vendorMember = await prisma.vendorMember.upsert({
      where: { id: seededId('vendor_member', pad(blueprint.index, 2)) },
      update: {
        vendorId: vendor.id,
        userId: vendorUser.id,
        role: 'OWNER',
      },
      create: {
        id: seededId('vendor_member', pad(blueprint.index, 2)),
        vendorId: vendor.id,
        userId: vendorUser.id,
        role: 'OWNER',
      },
    });
    track('vendorMember', vendorMember.id);

    const vendorModel: SeedVendor = {
      id: vendor.id,
      ownerUserId: vendor.ownerUserId,
      name: vendor.name,
      country: vendor.country as 'US' | 'MM',
      currency: vendor.currency as 'USD' | 'MMK',
      status: vendor.status,
      commissionPct: vendor.commissionPct,
    };
    vendors.push(vendorModel);
    if (vendor.status === VendorStatus.APPROVED) {
      approvedVendors.push(vendorModel);
    }
  }

  for (let i = 1; i <= 24; i += 1) {
    const locale = i % 3 === 0 ? 'my' : 'en';
    const customer = await upsertSeedUser({
      id: seededId('user', 'customer', pad(i, 2)),
      email: `customer${i}@eco.local`,
      role: Role.CUSTOMER,
      locale,
      phone:
        i % 2 === 0
          ? `+1-555-500-${pad(i, 4)}`
          : `+95-9-8888-20${pad(i, 2)}`,
      passwordHash,
      emailVerifiedAt: verifiedAt,
    });

    const customerModel: SeedUser = {
      id: customer.id,
      email: customer.email,
      role: customer.role,
      locale: customer.locale,
      phone: customer.phone,
    };
    customerUsers.push(customerModel);
    userLocaleById.set(customer.id, customer.locale);
  }

  const categoryBlueprints: Array<{
    key: string;
    en_name: string;
    mm_name: string;
    parentKey: string | null;
  }> = [
    { key: 'home-living', en_name: 'Home & Living', mm_name: 'အိမ်သုံးနှင့် နေထိုင်မှု', parentKey: null },
    { key: 'kitchen-dining', en_name: 'Kitchen & Dining', mm_name: 'မီးဖိုချောင်နှင့် ထမင်းစား', parentKey: 'home-living' },
    {
      key: 'cleaning-supplies',
      en_name: 'Cleaning Supplies',
      mm_name: 'သန့်ရှင်းရေး ပစ္စည်းများ',
      parentKey: 'home-living',
    },
    { key: 'personal-care', en_name: 'Personal Care', mm_name: 'ကိုယ်ရေးကိုယ်တာ စောင့်ရှောက်မှု', parentKey: null },
    { key: 'skincare', en_name: 'Skincare', mm_name: 'အသားအရေ စောင့်ရှောက်မှု', parentKey: 'personal-care' },
    {
      key: 'zero-waste',
      en_name: 'Zero Waste Essentials',
      mm_name: 'အမှိုက်လျှော့ချ လိုအပ်ပစ္စည်းများ',
      parentKey: 'personal-care',
    },
    { key: 'fashion', en_name: 'Fashion', mm_name: 'ဖက်ရှင်', parentKey: null },
    { key: 'apparel', en_name: 'Apparel', mm_name: 'အဝတ်အထည်', parentKey: 'fashion' },
    {
      key: 'bags-accessories',
      en_name: 'Bags & Accessories',
      mm_name: 'အိတ်နှင့် အသုံးအဆောင်',
      parentKey: 'fashion',
    },
    { key: 'food-beverage', en_name: 'Food & Beverage', mm_name: 'အစားအသောက်နှင့် အဖျော်ယမကာ', parentKey: null },
    { key: 'snacks', en_name: 'Snacks', mm_name: 'စားစရာလေးများ', parentKey: 'food-beverage' },
    {
      key: 'tea-coffee',
      en_name: 'Tea & Coffee',
      mm_name: 'လက်ဖက်နှင့် ကော်ဖီ',
      parentKey: 'food-beverage',
    },
    { key: 'baby-family', en_name: 'Baby & Family', mm_name: 'ကလေးနှင့် မိသားစု', parentKey: null },
    { key: 'office-lifestyle', en_name: 'Office & Lifestyle', mm_name: 'ရုံးနှင့် လူနေမှုဘဝ', parentKey: null },
  ];

  const categoriesByKey = new Map<string, SeedCategory>();
  for (const categoryInput of categoryBlueprints) {
    const id = seededId('category', categoryInput.key);
    const parentId = categoryInput.parentKey
      ? categoriesByKey.get(categoryInput.parentKey)?.id ?? null
      : null;

    const category = await prisma.category.upsert({
      where: { id },
      update: {
        name: categoryInput.en_name,
        en_name: categoryInput.en_name,
        mm_name: categoryInput.mm_name,
        slug: `seed-${slugify(categoryInput.key)}`,
        parentId,
      },
      create: {
        id,
        name: categoryInput.en_name,
        en_name: categoryInput.en_name,
        mm_name: categoryInput.mm_name,
        slug: `seed-${slugify(categoryInput.key)}`,
        parentId,
      },
    });
    track('category', category.id);

    categoriesByKey.set(categoryInput.key, {
      key: categoryInput.key,
      id: category.id,
      en_name: category.en_name,
      mm_name: category.mm_name,
      slug: category.slug,
      parentKey: categoryInput.parentKey,
    });
  }

  const categories = [...categoriesByKey.values()];

  const tagNames: Array<{ en_name: string; mm_name: string }> = [
    { en_name: 'Recycled Materials', mm_name: 'ပြန်လည်သုံးစွဲထားသော ပစ္စည်း' },
    { en_name: 'Plastic Free', mm_name: 'ပလတ်စတစ်မပါ' },
    { en_name: 'Organic', mm_name: 'အော်ဂဲနစ်' },
    { en_name: 'Vegan', mm_name: 'ဗီးဂန်' },
    { en_name: 'Fair Trade', mm_name: 'တရားမျှတ ကုန်သွယ်ရေး' },
    { en_name: 'Upcycled', mm_name: 'ပြန်လည်ဖန်တီး အသုံးပြု' },
    { en_name: 'Biodegradable', mm_name: 'သဘာဝတွင် ပျော်ဝင်နိုင်' },
    { en_name: 'Refillable', mm_name: 'ပြန်ဖြည့်အသုံးပြုနိုင်' },
    { en_name: 'Energy Efficient', mm_name: 'စွမ်းအင် ထိရောက်' },
    { en_name: 'Low Carbon', mm_name: 'ကာဗွန်နည်း' },
    { en_name: 'Local Sourced', mm_name: 'ဒေသတွင်းမှ ရရှိ' },
    { en_name: 'Handmade', mm_name: 'လက်လုပ်' },
    { en_name: 'Cruelty Free', mm_name: 'တိရစ္ဆာန်မညှဉ်းပန်း' },
    { en_name: 'Compostable', mm_name: 'မြေဆွေးပြုလုပ်နိုင်' },
    { en_name: 'Water Saving', mm_name: 'ရေချွေတာ' },
    { en_name: 'Ethically Made', mm_name: 'ကျင့်ဝတ်နှင့် ကိုက်ညီစွာ ထုတ်လုပ်' },
  ];

  const tags: SeedTag[] = [];
  for (let i = 0; i < tagNames.length; i += 1) {
    const tagInput = tagNames[i];
    const id = seededId('tag', pad(i + 1, 2));
    const slug = `seed-${slugify(tagInput.en_name)}`;
    const description = `${tagInput.en_name} verified for eco-friendly catalog curation.`;

    const tag = await prisma.sustainabilityTag.upsert({
      where: { id },
      update: {
        name: tagInput.en_name,
        en_name: tagInput.en_name,
        mm_name: tagInput.mm_name,
        slug,
        description,
        active: true,
      },
      create: {
        id,
        name: tagInput.en_name,
        en_name: tagInput.en_name,
        mm_name: tagInput.mm_name,
        slug,
        description,
        active: true,
      },
    });
    track('sustainabilityTag', tag.id);

    tags.push({
      id: tag.id,
      en_name: tag.en_name,
      mm_name: tag.mm_name,
      slug: tag.slug,
      description: tag.description ?? description,
    });
  }

  const productPrefixes = [
    'Eco',
    'Green',
    'Pure',
    'Leaf',
    'Earth',
    'Nature',
    'Clean',
    'Solar',
  ];
  const productNouns = [
    'Bottle',
    'Bag',
    'Soap',
    'Detergent',
    'Candle',
    'Cup',
    'Notebook',
    'Towel',
  ];
  const productDescriptors = [
    'Reusable',
    'Compostable',
    'Biodegradable',
    'Handmade',
    'Sustainable',
  ];

  const variantsByVendor = new Map<string, SeedVariant[]>();
  const allVariants: SeedVariant[] = [];

  for (let i = 1; i <= 50; i += 1) {
    const vendor = approvedVendors[(i - 1) % approvedVendors.length];
    const category = categories[(i - 1) % categories.length];
    const productId = seededId('product', pad(i, 3));
    const title = `${pickOne(rng, productPrefixes)} ${pickOne(rng, productNouns)} ${i}`;
    const description = `${pickOne(rng, productDescriptors)} ${title} for daily low-impact living.`;
    const statusPattern = [
      ProductStatus.ACTIVE,
      ProductStatus.ACTIVE,
      ProductStatus.ACTIVE,
      ProductStatus.DRAFT,
      ProductStatus.ACTIVE,
      ProductStatus.ARCHIVED,
    ];
    const status = statusPattern[(i - 1) % statusPattern.length];
    const productCreatedAt = randomPastDate(rng, now);

    const product = await prisma.product.upsert({
      where: { id: productId },
      update: {
        vendorId: vendor.id,
        categoryId: category.id,
        title,
        description,
        status,
      },
      create: {
        id: productId,
        vendorId: vendor.id,
        categoryId: category.id,
        title,
        description,
        status,
        createdAt: productCreatedAt,
      },
    });
    track('product', product.id);

    for (let variantIndex = 1; variantIndex <= 2; variantIndex += 1) {
      const variantId = seededId('variant', pad(i, 3), variantIndex);
      const basePrice =
        vendor.currency === 'USD'
          ? randomInt(rng, 600, 4500)
          : randomInt(rng, 12000, 95000);
      const price = variantIndex === 2 ? Math.round(basePrice * 1.2) : basePrice;
      const baseStockQty = randomInt(rng, 260, 420);

      const variant = await prisma.productVariant.upsert({
        where: { id: variantId },
        update: {
          productId: product.id,
          sku: `SEED-SKU-${pad(i, 3)}-${variantIndex}`,
          options: [
            { name: 'size', value: variantIndex === 1 ? 'standard' : 'plus' },
            { name: 'material', value: variantIndex === 1 ? 'classic' : 'premium' },
          ] as Prisma.InputJsonValue,
          price,
          currency: vendor.currency,
          stockQty: baseStockQty,
          reservedQty: 0,
          weightG: randomInt(rng, 120, 1200),
        },
        create: {
          id: variantId,
          productId: product.id,
          sku: `SEED-SKU-${pad(i, 3)}-${variantIndex}`,
          options: [
            { name: 'size', value: variantIndex === 1 ? 'standard' : 'plus' },
            { name: 'material', value: variantIndex === 1 ? 'classic' : 'premium' },
          ] as Prisma.InputJsonValue,
          price,
          currency: vendor.currency,
          stockQty: baseStockQty,
          reservedQty: 0,
          weightG: randomInt(rng, 120, 1200),
        },
      });
      track('productVariant', variant.id);

      const variantModel: SeedVariant = {
        id: variant.id,
        productId: product.id,
        vendorId: vendor.id,
        currency: vendor.currency,
        price: variant.price,
        baseStockQty,
      };
      allVariants.push(variantModel);
      variantsByVendor.set(vendor.id, [
        ...(variantsByVendor.get(vendor.id) ?? []),
        variantModel,
      ]);
    }

    for (let imageIndex = 1; imageIndex <= 2; imageIndex += 1) {
      const image = await prisma.productImage.upsert({
        where: { id: seededId('image', pad(i, 3), imageIndex) },
        update: {
          productId: product.id,
          url: `https://picsum.photos/seed/${product.id}-${imageIndex}/900/900`,
          altText: `${title} image ${imageIndex}`,
          sortOrder: imageIndex - 1,
        },
        create: {
          id: seededId('image', pad(i, 3), imageIndex),
          productId: product.id,
          url: `https://picsum.photos/seed/${product.id}-${imageIndex}/900/900`,
          altText: `${title} image ${imageIndex}`,
          sortOrder: imageIndex - 1,
        },
      });
      track('productImage', image.id);
    }

    const chosenTags = [tags[(i * 2) % tags.length], tags[(i * 2 + 5) % tags.length]].filter(
      (tag, index, list) =>
        list.findIndex((entry) => entry.id === tag.id) === index,
    );

    for (let j = 0; j < chosenTags.length; j += 1) {
      const tag = chosenTags[j];
      const row = await prisma.productTag.upsert({
        where: { id: seededId('product_tag', pad(i, 3), j + 1) },
        update: {
          productId: product.id,
          tagId: tag.id,
        },
        create: {
          id: seededId('product_tag', pad(i, 3), j + 1),
          productId: product.id,
          tagId: tag.id,
        },
      });
      track('productTag', row.id);
    }
  }

  const shippingRatesByVendorCountry = new Map<string, SeedShippingRate>();
  const pickupLocationIdsByVendor = new Map<string, string[]>();

  for (let i = 0; i < approvedVendors.length; i += 1) {
    const vendor = approvedVendors[i];
    const shippingCountries: Array<'US' | 'MM'> =
      vendor.currency === 'USD' ? ['US', 'MM'] : ['MM', 'US'];
    const shippingFees = vendor.currency === 'USD' ? [699, 1499] : [2500, 5000];

    for (let rateIndex = 0; rateIndex < shippingCountries.length; rateIndex += 1) {
      const country = shippingCountries[rateIndex];
      const rate = await prisma.shippingRate.upsert({
        where: {
          id: seededId('shipping_rate', pad(i + 1, 2), country.toLowerCase()),
        },
        update: {
          vendorId: vendor.id,
          country,
          flatRate: shippingFees[rateIndex],
          currency: vendor.currency,
          active: true,
        },
        create: {
          id: seededId('shipping_rate', pad(i + 1, 2), country.toLowerCase()),
          vendorId: vendor.id,
          country,
          flatRate: shippingFees[rateIndex],
          currency: vendor.currency,
          active: true,
        },
      });
      track('shippingRate', rate.id);

      shippingRatesByVendorCountry.set(`${vendor.id}:${country}`, {
        id: rate.id,
        vendorId: vendor.id,
        country,
        flatRate: rate.flatRate,
        currency: rate.currency as 'USD' | 'MMK',
      });
    }

    const pickupIds: string[] = [];
    for (let pickupIndex = 1; pickupIndex <= 2; pickupIndex += 1) {
      const pickup = await prisma.pickupLocation.upsert({
        where: {
          id: seededId('pickup_location', pad(i + 1, 2), pickupIndex),
        },
        update: {
          vendorId: vendor.id,
          name: `${vendor.name} Pickup ${pickupIndex}`,
          line1: `${100 + pickupIndex} Seed Street`,
          city: vendor.country === 'US' ? 'San Francisco' : 'Yangon',
          state: vendor.country === 'US' ? 'CA' : null,
          country: vendor.country,
          hours: 'Mon-Sat 09:00-18:00',
        },
        create: {
          id: seededId('pickup_location', pad(i + 1, 2), pickupIndex),
          vendorId: vendor.id,
          name: `${vendor.name} Pickup ${pickupIndex}`,
          line1: `${100 + pickupIndex} Seed Street`,
          city: vendor.country === 'US' ? 'San Francisco' : 'Yangon',
          state: vendor.country === 'US' ? 'CA' : null,
          country: vendor.country,
          hours: 'Mon-Sat 09:00-18:00',
        },
      });
      track('pickupLocation', pickup.id);
      pickupIds.push(pickup.id);
    }
    pickupLocationIdsByVendor.set(vendor.id, pickupIds);
  }

  const addressesByUserCountry = new Map<string, { US: string; MM: string }>();
  for (let i = 0; i < customerUsers.length; i += 1) {
    const customer = customerUsers[i];

    const usAddress = await prisma.address.upsert({
      where: { id: seededId('address', 'customer', pad(i + 1, 2), 'us') },
      update: {
        userId: customer.id,
        name: `Customer ${i + 1} US`,
        line1: `${1000 + i} Market St`,
        line2: `Apt ${i + 1}`,
        city: 'San Francisco',
        state: 'CA',
        postal: `94${pad(i + 1, 3)}`,
        country: 'US',
        phone: customer.phone,
      },
      create: {
        id: seededId('address', 'customer', pad(i + 1, 2), 'us'),
        userId: customer.id,
        name: `Customer ${i + 1} US`,
        line1: `${1000 + i} Market St`,
        line2: `Apt ${i + 1}`,
        city: 'San Francisco',
        state: 'CA',
        postal: `94${pad(i + 1, 3)}`,
        country: 'US',
        phone: customer.phone,
      },
    });
    track('address', usAddress.id);

    const mmAddress = await prisma.address.upsert({
      where: { id: seededId('address', 'customer', pad(i + 1, 2), 'mm') },
      update: {
        userId: customer.id,
        name: `Customer ${i + 1} MM`,
        line1: `${20 + i} Pyay Road`,
        line2: null,
        city: 'Yangon',
        state: null,
        postal: `11${pad(i + 1, 3)}`,
        country: 'MM',
        phone: customer.phone,
      },
      create: {
        id: seededId('address', 'customer', pad(i + 1, 2), 'mm'),
        userId: customer.id,
        name: `Customer ${i + 1} MM`,
        line1: `${20 + i} Pyay Road`,
        line2: null,
        city: 'Yangon',
        state: null,
        postal: `11${pad(i + 1, 3)}`,
        country: 'MM',
        phone: customer.phone,
      },
    });
    track('address', mmAddress.id);

    addressesByUserCountry.set(customer.id, {
      US: usAddress.id,
      MM: mmAddress.id,
    });
  }

  for (let i = 1; i <= 12; i += 1) {
    const customer = customerUsers[i - 1];
    const vendor = approvedVendors[(i - 1) % approvedVendors.length];
    const cartId = seededId('cart', pad(i, 2));

    const cart = await prisma.cart.upsert({
      where: { id: cartId },
      update: {
        userId: customer.id,
        vendorId: vendor.id,
        currency: vendor.currency,
      },
      create: {
        id: cartId,
        userId: customer.id,
        vendorId: vendor.id,
        currency: vendor.currency,
      },
    });
    track('cart', cart.id);

    const variantPool = variantsByVendor.get(vendor.id) ?? [];
    for (let itemIndex = 1; itemIndex <= 2; itemIndex += 1) {
      const variant = variantPool[(i * itemIndex) % variantPool.length];
      const item = await prisma.cartItem.upsert({
        where: {
          id: seededId('cart_item', pad(i, 2), itemIndex),
        },
        update: {
          cartId: cart.id,
          variantId: variant.id,
          qty: randomInt(rng, 1, 2),
          unitPrice: variant.price,
        },
        create: {
          id: seededId('cart_item', pad(i, 2), itemIndex),
          cartId: cart.id,
          variantId: variant.id,
          qty: randomInt(rng, 1, 2),
          unitPrice: variant.price,
        },
      });
      track('cartItem', item.id);
    }
  }

  for (let i = 1; i <= 6; i += 1) {
    const vendor = i <= 4 ? approvedVendors[(i - 1) % approvedVendors.length] : null;
    const promotion = await prisma.promotion.upsert({
      where: { id: seededId('promotion', pad(i, 2)) },
      update: {
        vendorId: vendor?.id ?? null,
        code: `SEEDSALE${pad(i, 2)}`,
        type: i % 2 === 0 ? 'FIXED' : 'PERCENT',
        amount: i % 2 === 0 ? (vendor?.currency === 'MMK' ? 5000 : 500) : 10 + i,
        startsAt: addDays(now, -7),
        endsAt: addDays(now, 30),
        minOrder: i % 2 === 0 ? 2000 : 1000,
      },
      create: {
        id: seededId('promotion', pad(i, 2)),
        vendorId: vendor?.id ?? null,
        code: `SEEDSALE${pad(i, 2)}`,
        type: i % 2 === 0 ? 'FIXED' : 'PERCENT',
        amount: i % 2 === 0 ? (vendor?.currency === 'MMK' ? 5000 : 500) : 10 + i,
        startsAt: addDays(now, -7),
        endsAt: addDays(now, 30),
        minOrder: i % 2 === 0 ? 2000 : 1000,
      },
    });
    track('promotion', promotion.id);
  }

  const blogBlueprints = [
    {
      key: 'low-waste-kitchen',
      title: 'Low-Waste Kitchen Essentials for Everyday Use',
      excerpt: 'Simple product swaps to cut waste and save money in your kitchen.',
      content:
        'Start with reusable cloths, refillable cleaners, and durable glass storage. Choose products with long life cycles and recyclable packaging to reduce daily waste.',
      coverImage:
        'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80',
    },
    {
      key: 'smart-energy-home',
      title: 'Smart Energy Picks for a Greener Home',
      excerpt: 'Practical devices that reduce power usage without sacrificing comfort.',
      content:
        'Power strips, energy meters, efficient kettles, and LED upgrades can lower monthly bills. Focus on measurable savings and vendor warranty support.',
      coverImage:
        'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=1200&q=80',
    },
    {
      key: 'eco-fashion-basics',
      title: 'Eco Fashion Basics: Buy Less, Wear Better',
      excerpt: 'Build a small wardrobe with durable, versatile materials.',
      content:
        'Prioritize repairable items and neutral combinations. A tighter wardrobe lowers impulse buying and improves long-term value per wear.',
      coverImage:
        'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80',
    },
    {
      key: 'safe-cleaning-guide',
      title: 'Safe Home Cleaning Guide with Eco Ingredients',
      excerpt: 'Cleaner routines that are safer for your home and environment.',
      content:
        'Use concentrated formulas and refill stations where possible. Track usage frequency and avoid overbuying single-purpose cleaners.',
      coverImage:
        'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=80',
    },
    {
      key: 'greener-shopping-checklist',
      title: 'Greener Shopping Checklist Before You Checkout',
      excerpt: 'A quick checklist to avoid low-quality or misleading products.',
      content:
        'Check material transparency, vendor ratings, return policy, and product lifecycle. Compare options by durability and local support.',
      coverImage:
        'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80',
    },
    {
      key: 'water-saving-home',
      title: 'Water-Saving Products That Actually Work',
      excerpt: 'High-impact tools to reduce household water usage.',
      content:
        'Install low-flow accessories and monitor daily usage trends. Small fixture changes can produce meaningful yearly savings.',
      coverImage:
        'https://images.unsplash.com/photo-1523413651479-597eb2da0ad6?auto=format&fit=crop&w=1200&q=80',
    },
  ];

  for (let i = 0; i < blogBlueprints.length; i += 1) {
    const blueprint = blogBlueprints[i];
    const post = await prisma.blogPost.upsert({
      where: { id: seededId('blog', pad(i + 1, 2)) },
      update: {
        title: blueprint.title,
        slug: blueprint.key,
        excerpt: blueprint.excerpt,
        content: blueprint.content,
        coverImage: blueprint.coverImage,
        publishedAt: addDays(now, -(i + 1) * 2),
      },
      create: {
        id: seededId('blog', pad(i + 1, 2)),
        title: blueprint.title,
        slug: blueprint.key,
        excerpt: blueprint.excerpt,
        content: blueprint.content,
        coverImage: blueprint.coverImage,
        publishedAt: addDays(now, -(i + 1) * 2),
        createdAt: addDays(now, -(i + 1) * 2),
      },
    });
    track('blogPost', post.id);
  }

  const reservedByVariant = new Map<string, number>();
  const consumedByVariant = new Map<string, number>();
  const allOrderItems: SeedOrderItemMeta[] = [];
  const allOrders: SeedOrderMeta[] = [];
  const allPayments: SeedPaymentMeta[] = [];
  const paymentByOrderId = new Map<string, SeedPaymentMeta>();

  const pickupOnlyStatuses = new Set<OrderStatus>([
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.PICKED_UP,
  ]);
  const shippingOnlyStatuses = new Set<OrderStatus>([
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
  ]);
  const orderStatusPlan = getOrderStatusPlan(rng);

  for (let i = 1; i <= 60; i += 1) {
    const status = orderStatusPlan[i - 1];
    const vendor = approvedVendors[(i * 3) % approvedVendors.length];
    const customer = customerUsers[(i * 5) % customerUsers.length];
    const variantPool = variantsByVendor.get(vendor.id) ?? [];

    let fulfillment = i % 3 === 0 ? FulfillmentType.PICKUP : FulfillmentType.SHIPPING;
    if (pickupOnlyStatuses.has(status)) {
      fulfillment = FulfillmentType.PICKUP;
    }
    if (shippingOnlyStatuses.has(status)) {
      fulfillment = FulfillmentType.SHIPPING;
    }

    let shippingAddrId: string | null = null;
    let pickupLocId: string | null = null;
    let shippingFee = 0;

    if (fulfillment === FulfillmentType.SHIPPING) {
      const preferredCountry: 'US' | 'MM' = i % 2 === 0 ? 'US' : 'MM';
      const fallbackCountry: 'US' | 'MM' = preferredCountry === 'US' ? 'MM' : 'US';
      const shippingRate =
        shippingRatesByVendorCountry.get(`${vendor.id}:${preferredCountry}`) ??
        shippingRatesByVendorCountry.get(`${vendor.id}:${fallbackCountry}`);

      const selectedCountry = shippingRate?.country ?? vendor.country;
      shippingAddrId = addressesByUserCountry.get(customer.id)?.[selectedCountry] ?? null;
      shippingFee = shippingRate?.flatRate ?? 0;
    } else {
      const pickupIds = pickupLocationIdsByVendor.get(vendor.id) ?? [];
      pickupLocId = pickupIds[i % pickupIds.length] ?? null;
    }

    const itemCount = randomInt(rng, 1, 3);
    const itemDefinitions: Array<{ variant: SeedVariant; qty: number }> = [];
    const startIndex = (i * 2) % variantPool.length;

    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      const variant = variantPool[(startIndex + itemIndex * 3) % variantPool.length];
      itemDefinitions.push({
        variant,
        qty: randomInt(rng, 1, 3),
      });
    }

    const subtotal = itemDefinitions.reduce(
      (sum, item) => sum + item.variant.price * item.qty,
      0,
    );
    const taxAmount = 0;
    const discountAmount = 0;
    const total = subtotal + shippingFee + taxAmount - discountAmount;
    const createdAt = randomPastDate(rng, now);
    const paymentExpiresAt =
      status === OrderStatus.PENDING_PAYMENT
        ? addMinutes(createdAt, STOCK_RESERVATION_MINUTES)
        : null;

    let paymentStatus: PaymentStatus;
    if (status === OrderStatus.REFUNDED) {
      paymentStatus = PaymentStatus.REFUNDED;
    } else if (status === OrderStatus.PENDING_PAYMENT) {
      paymentStatus = i % 4 === 0 ? PaymentStatus.FAILED : PaymentStatus.REQUIRES_ACTION;
    } else if (status === OrderStatus.CANCELED) {
      paymentStatus = PaymentStatus.FAILED;
    } else {
      paymentStatus = PaymentStatus.SUCCEEDED;
    }

    const orderId = seededId('order', pad(i, 3));
    const order = await prisma.order.upsert({
      where: { id: orderId },
      update: {
        userId: customer.id,
        vendorId: vendor.id,
        status,
        currency: vendor.currency,
        subtotal,
        shippingFee,
        taxAmount,
        discountAmount,
        total,
        fulfillment,
        shippingAddrId,
        pickupLocId,
        paymentExpiresAt,
      },
      create: {
        id: orderId,
        userId: customer.id,
        vendorId: vendor.id,
        status,
        currency: vendor.currency,
        subtotal,
        shippingFee,
        taxAmount,
        discountAmount,
        total,
        fulfillment,
        shippingAddrId,
        pickupLocId,
        paymentExpiresAt,
        createdAt,
      },
    });
    track('order', order.id);

    allOrders.push({
      id: order.id,
      userId: order.userId,
      vendorId: order.vendorId,
      status: order.status,
      fulfillment: order.fulfillment,
      currency: order.currency as 'USD' | 'MMK',
      total: order.total,
      createdAt,
    });

    for (let itemIndex = 0; itemIndex < itemDefinitions.length; itemIndex += 1) {
      const item = itemDefinitions[itemIndex];
      const orderItem = await prisma.orderItem.upsert({
        where: { id: seededId('order_item', pad(i, 3), itemIndex + 1) },
        update: {
          orderId: order.id,
          variantId: item.variant.id,
          qty: item.qty,
          unitPrice: item.variant.price,
          lineTotal: item.variant.price * item.qty,
        },
        create: {
          id: seededId('order_item', pad(i, 3), itemIndex + 1),
          orderId: order.id,
          variantId: item.variant.id,
          qty: item.qty,
          unitPrice: item.variant.price,
          lineTotal: item.variant.price * item.qty,
        },
      });
      track('orderItem', orderItem.id);

      allOrderItems.push({
        id: orderItem.id,
        orderId: order.id,
        variantId: item.variant.id,
        qty: orderItem.qty,
        unitPrice: orderItem.unitPrice,
        lineTotal: orderItem.lineTotal,
        orderStatus: order.status,
      });

      if (
        order.status === OrderStatus.PENDING_PAYMENT &&
        paymentStatus === PaymentStatus.REQUIRES_ACTION
      ) {
        incrementMapValue(reservedByVariant, item.variant.id, item.qty);
      } else if (order.status !== OrderStatus.CANCELED) {
        incrementMapValue(consumedByVariant, item.variant.id, item.qty);
      }
    }

    const provider =
      vendor.currency === 'USD'
        ? PaymentProvider.STRIPE
        : i % 2 === 0
          ? PaymentProvider.WAVE_MONEY
          : PaymentProvider.KBZPAY;

    let providerRef = `mock:${provider}:order:${order.id}`;
    if (provider === PaymentProvider.STRIPE) {
      if (paymentStatus === PaymentStatus.REQUIRES_ACTION) {
        providerRef = `cs_seed_${pad(i, 3)}`;
      } else if (paymentStatus === PaymentStatus.FAILED) {
        providerRef = `pi_failed_seed_${pad(i, 3)}`;
      } else if (paymentStatus === PaymentStatus.REFUNDED) {
        providerRef = `pi_refunded_seed_${pad(i, 3)}`;
      } else {
        providerRef = `pi_succeeded_seed_${pad(i, 3)}`;
      }
    }

    const paymentCreatedAt = addMinutes(createdAt, 5);
    const payment = await prisma.payment.upsert({
      where: { id: seededId('payment', pad(i, 3)) },
      update: {
        orderId: order.id,
        provider,
        providerRef,
        amount: order.total,
        currency: order.currency,
        status: paymentStatus,
      },
      create: {
        id: seededId('payment', pad(i, 3)),
        orderId: order.id,
        provider,
        providerRef,
        amount: order.total,
        currency: order.currency,
        status: paymentStatus,
        createdAt: paymentCreatedAt,
      },
    });
    track('payment', payment.id);

    const paymentModel: SeedPaymentMeta = {
      id: payment.id,
      orderId: order.id,
      vendorId: order.vendorId,
      provider: payment.provider,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      providerRef: payment.providerRef,
      createdAt: paymentCreatedAt,
    };
    allPayments.push(paymentModel);
    paymentByOrderId.set(order.id, paymentModel);
  }

  for (const variant of allVariants) {
    const consumedQty = consumedByVariant.get(variant.id) ?? 0;
    const reservedQty = reservedByVariant.get(variant.id) ?? 0;
    const projectedStock = variant.baseStockQty - consumedQty;
    const stockQty = Math.max(projectedStock, reservedQty + 5);

    await prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        stockQty,
        reservedQty,
      },
    });
  }

  const allReturns: SeedReturnMeta[] = [];
  let returnIndex = 1;

  const createReturn = async (input: {
    order: SeedOrderMeta;
    status: ReturnRequestStatus;
    reason: string;
    notes: string | null;
    resolvedAt: Date | null;
    refundAmount: number | null;
    refundProvider: PaymentProvider | null;
    refundRef: string | null;
  }) => {
    const returnId = seededId('return', pad(returnIndex, 3));
    returnIndex += 1;

    const requestedAt = addDays(input.order.createdAt, 2);
    const created = await prisma.returnRequest.upsert({
      where: { id: returnId },
      update: {
        orderId: input.order.id,
        reason: input.reason,
        status: input.status,
        requestedAt,
        resolvedAt: input.resolvedAt,
        refundAmount: input.refundAmount,
        refundProvider: input.refundProvider,
        refundRef: input.refundRef,
        notes: input.notes,
      },
      create: {
        id: returnId,
        orderId: input.order.id,
        reason: input.reason,
        status: input.status,
        requestedAt,
        resolvedAt: input.resolvedAt,
        refundAmount: input.refundAmount,
        refundProvider: input.refundProvider,
        refundRef: input.refundRef,
        notes: input.notes,
      },
    });
    track('returnRequest', created.id);

    allReturns.push({
      id: created.id,
      orderId: created.orderId,
      status: created.status,
      requestedAt: created.requestedAt,
    });
  };

  for (const order of allOrders) {
    if (order.status === OrderStatus.RETURN_REQUESTED) {
      await createReturn({
        order,
        status: ReturnRequestStatus.REQUESTED,
        reason: 'Received item not as expected.',
        notes: null,
        resolvedAt: null,
        refundAmount: null,
        refundProvider: null,
        refundRef: null,
      });
    }

    if (order.status === OrderStatus.RETURN_APPROVED) {
      await createReturn({
        order,
        status: ReturnRequestStatus.APPROVED,
        reason: 'Packaging defect reported by customer.',
        notes: 'Vendor approved and waiting for return parcel.',
        resolvedAt: addDays(order.createdAt, 5),
        refundAmount: null,
        refundProvider: null,
        refundRef: null,
      });
    }

    if (order.status === OrderStatus.RETURNED) {
      await createReturn({
        order,
        status: ReturnRequestStatus.RECEIVED,
        reason: 'Wrong product variant received.',
        notes: 'Vendor marked package as received.',
        resolvedAt: null,
        refundAmount: null,
        refundProvider: null,
        refundRef: null,
      });
    }

    if (order.status === OrderStatus.REFUNDED) {
      const payment = paymentByOrderId.get(order.id);
      await createReturn({
        order,
        status: ReturnRequestStatus.REFUNDED,
        reason: 'Item damaged during delivery.',
        notes: 'Admin completed full refund.',
        resolvedAt: addDays(order.createdAt, 8),
        refundAmount: order.total,
        refundProvider: payment?.provider ?? null,
        refundRef: payment ? `seed_refund_${payment.id}` : null,
      });
    }
  }

  const rejectedOrder = allOrders.find((order) => order.status === OrderStatus.DELIVERED);
  if (rejectedOrder) {
    await createReturn({
      order: rejectedOrder,
      status: ReturnRequestStatus.REJECTED,
      reason: 'Requested return outside policy conditions.',
      notes: 'Rejected after inspection.',
      resolvedAt: addDays(rejectedOrder.createdAt, 6),
      refundAmount: null,
      refundProvider: null,
      refundRef: null,
    });
  }

  const reviewEligibleStatuses = new Set<OrderStatus>([
    OrderStatus.DELIVERED,
    OrderStatus.PICKED_UP,
    OrderStatus.RETURN_REQUESTED,
    OrderStatus.RETURN_APPROVED,
    OrderStatus.RETURNED,
    OrderStatus.REFUNDED,
  ]);
  const reviewableItems = allOrderItems.filter((item) =>
    reviewEligibleStatuses.has(item.orderStatus),
  );

  for (let i = 0; i < Math.min(20, reviewableItems.length); i += 1) {
    const item = reviewableItems[i];
    const review = await prisma.review.upsert({
      where: { orderItemId: item.id },
      update: {
        rating: 3 + (i % 3),
        comment: `Seed review #${i + 1} for order item ${item.id}.`,
      },
      create: {
        id: seededId('review', pad(i + 1, 3)),
        orderItemId: item.id,
        rating: 3 + (i % 3),
        comment: `Seed review #${i + 1} for order item ${item.id}.`,
        createdAt: addDays(now, -randomInt(rng, 1, 40)),
      },
    });
    track('review', review.id);
  }

  const orderById = new Map<string, SeedOrderMeta>(
    allOrders.map((order) => [order.id, order]),
  );

  const chatOrderPool = allOrders
    .filter((order) => order.status !== OrderStatus.CANCELED)
    .slice(0, 20);
  const chatMessageMeta: Array<{
    orderId: string;
    senderUserId: string;
    recipientUserId: string;
    messageId: string;
    createdAt: Date;
  }> = [];

  for (let i = 0; i < chatOrderPool.length; i += 1) {
    const order = chatOrderPool[i];
    const vendorOwnerId = vendorOwnerByVendorId.get(order.vendorId);
    if (!vendorOwnerId) {
      continue;
    }

    const thread = await prisma.chatThread.upsert({
      where: { orderId: order.id },
      update: {
        customerUserId: order.userId,
        vendorId: order.vendorId,
      },
      create: {
        id: seededId('chat_thread', pad(i + 1, 3)),
        orderId: order.id,
        customerUserId: order.userId,
        vendorId: order.vendorId,
      },
    });
    track('chatThread', thread.id);

    const messages = [
      {
        id: seededId('chat_message', pad(i + 1, 3), 1),
        senderUserId: order.userId,
        recipientUserId: vendorOwnerId,
        body: 'Hello, may I get an update on this order?',
      },
      {
        id: seededId('chat_message', pad(i + 1, 3), 2),
        senderUserId: vendorOwnerId,
        recipientUserId: order.userId,
        body: 'Sure, your order is being prepared now.',
      },
      {
        id: seededId('chat_message', pad(i + 1, 3), 3),
        senderUserId: order.userId,
        recipientUserId: vendorOwnerId,
        body: 'Thanks, please notify once it ships.',
      },
    ];

    for (let m = 0; m < messages.length; m += 1) {
      const messageCreatedAt = addMinutes(order.createdAt, m * 8 + 1);
      const message = await prisma.chatMessage.upsert({
        where: { id: messages[m].id },
        update: {
          threadId: thread.id,
          senderUserId: messages[m].senderUserId,
          body: messages[m].body,
        },
        create: {
          id: messages[m].id,
          threadId: thread.id,
          senderUserId: messages[m].senderUserId,
          body: messages[m].body,
          createdAt: messageCreatedAt,
        },
      });
      track('chatMessage', message.id);

      chatMessageMeta.push({
        orderId: order.id,
        senderUserId: messages[m].senderUserId,
        recipientUserId: messages[m].recipientUserId,
        messageId: message.id,
        createdAt: messageCreatedAt,
      });
    }

    const customerReadState = await prisma.chatReadState.upsert({
      where: {
        threadId_userId: {
          threadId: thread.id,
          userId: order.userId,
        },
      },
      update: {
        lastReadMessageId: seededId('chat_message', pad(i + 1, 3), 3),
        lastReadAt: addMinutes(order.createdAt, 20),
      },
      create: {
        id: seededId('chat_read_state', pad(i + 1, 3), 'customer'),
        threadId: thread.id,
        userId: order.userId,
        lastReadMessageId: seededId('chat_message', pad(i + 1, 3), 3),
        lastReadAt: addMinutes(order.createdAt, 20),
      },
    });
    track('chatReadState', customerReadState.id);

    const vendorReadState = await prisma.chatReadState.upsert({
      where: {
        threadId_userId: {
          threadId: thread.id,
          userId: vendorOwnerId,
        },
      },
      update: {
        lastReadMessageId: seededId('chat_message', pad(i + 1, 3), 2),
        lastReadAt: addMinutes(order.createdAt, 12),
      },
      create: {
        id: seededId('chat_read_state', pad(i + 1, 3), 'vendor'),
        threadId: thread.id,
        userId: vendorOwnerId,
        lastReadMessageId: seededId('chat_message', pad(i + 1, 3), 2),
        lastReadAt: addMinutes(order.createdAt, 12),
      },
    });
    track('chatReadState', vendorReadState.id);
  }

  const notifications: SeedNotificationMeta[] = [];
  let notificationCounter = 1;

  const pushNotification = (input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    payload: Prisma.InputJsonValue;
    createdAt: Date;
    markRead: boolean;
  }) => {
    notifications.push({
      id: seededId('notification', pad(notificationCounter, 5)),
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      payload: input.payload,
      readAt: input.markRead
        ? addMinutes(input.createdAt, randomInt(rng, 5, 60))
        : null,
      createdAt: input.createdAt,
    });
    notificationCounter += 1;
  };

  for (const order of allOrders) {
    const vendorOwnerId = vendorOwnerByVendorId.get(order.vendorId);
    if (!vendorOwnerId) {
      continue;
    }

    pushNotification({
      userId: order.userId,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'Order status updated',
      body: `Order ${order.id} is now ${order.status}.`,
      payload: { orderId: order.id, status: order.status } as Prisma.InputJsonValue,
      createdAt: addMinutes(order.createdAt, 3),
      markRead: randomInt(rng, 0, 1) === 1,
    });

    pushNotification({
      userId: vendorOwnerId,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'Vendor order update',
      body: `Order ${order.id} changed to ${order.status}.`,
      payload: { orderId: order.id, status: order.status } as Prisma.InputJsonValue,
      createdAt: addMinutes(order.createdAt, 4),
      markRead: randomInt(rng, 0, 1) === 1,
    });
  }

  for (const ret of allReturns) {
    const order = orderById.get(ret.orderId);
    if (!order) {
      continue;
    }
    const vendorOwnerId = vendorOwnerByVendorId.get(order.vendorId);
    if (!vendorOwnerId) {
      continue;
    }

    pushNotification({
      userId: order.userId,
      type: NotificationType.RETURN_STATUS_CHANGED,
      title: 'Return status changed',
      body: `Return ${ret.id} is now ${ret.status}.`,
      payload: {
        returnId: ret.id,
        orderId: ret.orderId,
        status: ret.status,
      } as Prisma.InputJsonValue,
      createdAt: addMinutes(ret.requestedAt, 2),
      markRead: randomInt(rng, 0, 1) === 1,
    });

    pushNotification({
      userId: vendorOwnerId,
      type: NotificationType.RETURN_STATUS_CHANGED,
      title: 'Return update for vendor',
      body: `Return ${ret.id} for order ${ret.orderId} is ${ret.status}.`,
      payload: {
        returnId: ret.id,
        orderId: ret.orderId,
        status: ret.status,
      } as Prisma.InputJsonValue,
      createdAt: addMinutes(ret.requestedAt, 3),
      markRead: randomInt(rng, 0, 1) === 1,
    });
  }

  for (const chatMessage of chatMessageMeta) {
    pushNotification({
      userId: chatMessage.recipientUserId,
      type: NotificationType.NEW_MESSAGE,
      title: 'New chat message',
      body: 'You received a new order chat message.',
      payload: {
        orderId: chatMessage.orderId,
        messageId: chatMessage.messageId,
        senderUserId: chatMessage.senderUserId,
      } as Prisma.InputJsonValue,
      createdAt: chatMessage.createdAt,
      markRead: randomInt(rng, 0, 1) === 1,
    });
  }

  for (let i = 0; i < notifications.length; i += 1) {
    const notification = notifications[i];
    const created = await prisma.notification.upsert({
      where: { id: notification.id },
      update: {
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        payload: notification.payload,
        readAt: notification.readAt,
      },
      create: {
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        payload: notification.payload,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      },
    });
    track('notification', created.id);

    const emailDelivery = await prisma.notificationDelivery.upsert({
      where: { id: seededId('notification_delivery', created.id, 'email') },
      update: {
        notificationId: created.id,
        channel: NotificationChannel.EMAIL,
        provider: 'sendgrid',
        status: NotificationDeliveryStatus.SENT,
        providerRef: `seed_email_${created.id}`,
        error: null,
      },
      create: {
        id: seededId('notification_delivery', created.id, 'email'),
        notificationId: created.id,
        channel: NotificationChannel.EMAIL,
        provider: 'sendgrid',
        status: NotificationDeliveryStatus.SENT,
        providerRef: `seed_email_${created.id}`,
        error: null,
      },
    });
    track('notificationDelivery', emailDelivery.id);

    if (i % 3 === 0) {
      const locale = userLocaleById.get(created.userId) ?? 'en';
      const smsStatus =
        i % 5 === 0
          ? NotificationDeliveryStatus.FAILED
          : NotificationDeliveryStatus.SENT;
      const smsDelivery = await prisma.notificationDelivery.upsert({
        where: { id: seededId('notification_delivery', created.id, 'sms') },
        update: {
          notificationId: created.id,
          channel: NotificationChannel.SMS,
          provider: locale === 'my' ? 'mm-gateway' : 'twilio',
          status: smsStatus,
          providerRef:
            smsStatus === NotificationDeliveryStatus.SENT
              ? `seed_sms_${created.id}`
              : null,
          error:
            smsStatus === NotificationDeliveryStatus.FAILED
              ? 'Simulated transient gateway timeout'
              : null,
        },
        create: {
          id: seededId('notification_delivery', created.id, 'sms'),
          notificationId: created.id,
          channel: NotificationChannel.SMS,
          provider: locale === 'my' ? 'mm-gateway' : 'twilio',
          status: smsStatus,
          providerRef:
            smsStatus === NotificationDeliveryStatus.SENT
              ? `seed_sms_${created.id}`
              : null,
          error:
            smsStatus === NotificationDeliveryStatus.FAILED
              ? 'Simulated transient gateway timeout'
              : null,
        },
      });
      track('notificationDelivery', smsDelivery.id);
    }
  }

  const ledgerCredits = new Map<string, number>();
  const ledgerDebits = new Map<string, number>();

  for (const payment of allPayments) {
    if (
      payment.status !== PaymentStatus.SUCCEEDED &&
      payment.status !== PaymentStatus.REFUNDED
    ) {
      continue;
    }

    const creditEntry = await prisma.vendorLedgerEntry.upsert({
      where: { id: seededId('ledger', 'credit', payment.id) },
      update: {
        vendorId: payment.vendorId,
        orderId: payment.orderId,
        paymentId: payment.id,
        type: VendorLedgerEntryType.CREDIT,
        amount: payment.amount,
        currency: payment.currency,
        note: 'Seed payment receivable',
      },
      create: {
        id: seededId('ledger', 'credit', payment.id),
        vendorId: payment.vendorId,
        orderId: payment.orderId,
        paymentId: payment.id,
        type: VendorLedgerEntryType.CREDIT,
        amount: payment.amount,
        currency: payment.currency,
        note: 'Seed payment receivable',
        createdAt: payment.createdAt,
      },
    });
    track('vendorLedgerEntry', creditEntry.id);
    incrementMapValue(
      ledgerCredits,
      `${payment.vendorId}:${payment.currency}`,
      payment.amount,
    );

    if (payment.status === PaymentStatus.REFUNDED) {
      const debitEntry = await prisma.vendorLedgerEntry.upsert({
        where: { id: seededId('ledger', 'debit', payment.id) },
        update: {
          vendorId: payment.vendorId,
          orderId: payment.orderId,
          paymentId: payment.id,
          type: VendorLedgerEntryType.DEBIT,
          amount: payment.amount,
          currency: payment.currency,
          note: 'Seed refund adjustment',
        },
        create: {
          id: seededId('ledger', 'debit', payment.id),
          vendorId: payment.vendorId,
          orderId: payment.orderId,
          paymentId: payment.id,
          type: VendorLedgerEntryType.DEBIT,
          amount: payment.amount,
          currency: payment.currency,
          note: 'Seed refund adjustment',
          createdAt: addMinutes(payment.createdAt, 10),
        },
      });
      track('vendorLedgerEntry', debitEntry.id);
      incrementMapValue(
        ledgerDebits,
        `${payment.vendorId}:${payment.currency}`,
        payment.amount,
      );
    }
  }

  const payoutBatchPeriodStart = getPeriodStartUtc(now);
  const payoutBatch = await prisma.vendorPayoutBatch.upsert({
    where: { id: seededId('payout_batch', 'weekly') },
    update: {
      periodStart: payoutBatchPeriodStart,
      periodEnd: addDays(payoutBatchPeriodStart, 7),
      status: VendorPayoutBatchStatus.PREPARED,
    },
    create: {
      id: seededId('payout_batch', 'weekly'),
      periodStart: payoutBatchPeriodStart,
      periodEnd: addDays(payoutBatchPeriodStart, 7),
      status: VendorPayoutBatchStatus.PREPARED,
      createdAt: now,
    },
  });
  track('vendorPayoutBatch', payoutBatch.id);

  for (const vendor of vendors) {
    const key = `${vendor.id}:${vendor.currency}`;
    const grossAmount = ledgerCredits.get(key) ?? 0;
    const refundAdjustments = ledgerDebits.get(key) ?? 0;
    const netAmount = grossAmount - refundAdjustments;

    const payoutItem = await prisma.vendorPayoutItem.upsert({
      where: {
        id: seededId('payout_item', vendor.id, vendor.currency.toLowerCase()),
      },
      update: {
        batchId: payoutBatch.id,
        vendorId: vendor.id,
        currency: vendor.currency,
        grossAmount,
        refundAdjustments,
        netAmount,
        status:
          netAmount > 0
            ? VendorPayoutItemStatus.READY
            : VendorPayoutItemStatus.SKIPPED,
      },
      create: {
        id: seededId('payout_item', vendor.id, vendor.currency.toLowerCase()),
        batchId: payoutBatch.id,
        vendorId: vendor.id,
        currency: vendor.currency,
        grossAmount,
        refundAdjustments,
        netAmount,
        status:
          netAmount > 0
            ? VendorPayoutItemStatus.READY
            : VendorPayoutItemStatus.SKIPPED,
        createdAt: now,
      },
    });
    track('vendorPayoutItem', payoutItem.id);
  }

  await cleanupStaleSeedRows();

  const countLabels = [
    'users',
    'vendors',
    'categories',
    'tags',
    'blogs',
    'products',
    'variants',
    'addresses',
    'carts',
    'orders',
    'payments',
    'returns',
    'chatThreads',
    'chatMessages',
    'notifications',
    'notificationDeliveries',
    'ledgerEntries',
    'payoutBatches',
    'payoutItems',
  ] as const;

  const countValues = await prisma.$transaction([
    prisma.user.count(),
    prisma.vendor.count(),
    prisma.category.count(),
    prisma.sustainabilityTag.count(),
    prisma.blogPost.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.address.count(),
    prisma.cart.count(),
    prisma.order.count(),
    prisma.payment.count(),
    prisma.returnRequest.count(),
    prisma.chatThread.count(),
    prisma.chatMessage.count(),
    prisma.notification.count(),
    prisma.notificationDelivery.count(),
    prisma.vendorLedgerEntry.count(),
    prisma.vendorPayoutBatch.count(),
    prisma.vendorPayoutItem.count(),
  ]);

  const totalCounts = countLabels.reduce<Record<string, number>>(
    (acc, label, index) => {
      acc[label] = countValues[index];
      return acc;
    },
    {},
  );

  console.log('Seed completed (idempotent).');
  console.log('Target seeded row counts:', {
    users: targets.user.size,
    vendors: targets.vendor.size,
    categories: targets.category.size,
    tags: targets.sustainabilityTag.size,
    blogs: targets.blogPost.size,
    products: targets.product.size,
    variants: targets.productVariant.size,
    addresses: targets.address.size,
    carts: targets.cart.size,
    orders: targets.order.size,
    payments: targets.payment.size,
    returns: targets.returnRequest.size,
    chatThreads: targets.chatThread.size,
    chatMessages: targets.chatMessage.size,
    notifications: targets.notification.size,
    deliveries: targets.notificationDelivery.size,
    ledgerEntries: targets.vendorLedgerEntry.size,
    payoutBatches: targets.vendorPayoutBatch.size,
    payoutItems: targets.vendorPayoutItem.size,
  });
  console.log('Database totals:', totalCounts);

  console.log('Demo credentials:');
  console.log('- admin: admin@eco.local / change-me');
  console.log('- vendor: vendor1@eco.local / change-me');
  console.log('- customer: customer1@eco.local / change-me');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// Static page copy. It describes how VP Mart actually works. It does not invent contact details,
// addresses, company registration or legal claims. Policy pages carry a review notice.
export const POLICY_NOTICE =
  'This text describes how the platform is designed to work. Have it reviewed by a legal professional and completed with your business details before launch.';

export const PAGES = {
  about: {
    title: 'About VP Mart',
    description:
      'VP Mart is a multi-vendor marketplace where buyers shop from many independent sellers.',
    sections: [
      {
        h: 'What VP Mart is',
        p: [
          'VP Mart is an online marketplace. Independent sellers list their own products, buyers choose from many sellers in one place, and delivery partners bring orders to your door.',
        ],
      },
      {
        id: 'marketplace',
        h: 'How the marketplace works',
        p: [
          'Each product page shows who is selling it, so you can compare sellers. Prices, stock and delivery terms are set by the seller. VP Mart calculates totals on its servers, so the amount you see at checkout is the amount charged.',
          'Sellers are reviewed before they can list products, and products in regulated categories such as food and medicines need the relevant licence details on the seller’s profile.',
          'Orders containing items from more than one seller are shipped separately, each with its own delivery estimate.',
        ],
      },
      {
        h: 'Three kinds of accounts',
        p: [
          'Buyers shop and track orders. Vendors list and sell products. Delivery agents collect packages from vendors and deliver them. VP Mart administrators review applications and keep the marketplace safe.',
        ],
      },
    ],
  },
  help: {
    title: 'Help Center',
    description: 'Find help with orders, delivery, returns and your account.',
    sections: [
      {
        h: 'Orders and delivery',
        p: [
          'Delivery dates depend on your PIN code, the seller’s processing time and the product type. Set your PIN code from the header to see dates on every product.',
        ],
      },
      {
        h: 'Your account',
        p: [
          'Manage your profile, password and security from My Account. If you forget your password, use the “Forgot password” link on the sign-in page.',
        ],
      },
      {
        h: 'Still stuck?',
        p: ['Send us a message from the Contact page and we will follow up.'],
        link: ['/contact', 'Contact support'],
      },
    ],
  },
  faq: {
    title: 'Frequently asked questions',
    description: 'Answers to common questions about shopping on VP Mart.',
    faq: [
      [
        'Do I need an account to browse?',
        'No. You can browse and search without signing in. You need a buyer account to add items to your cart and check out.',
      ],
      [
        'Why does the price I see come from the server?',
        'Prices, stock, shipping and tax are calculated by VP Mart’s servers from the seller’s current listing, never from your browser, so totals are always accurate.',
      ],
      [
        'Are prices inclusive of tax?',
        'Each product page and your cart state whether GST is included in the listed price.',
      ],
      [
        'Can I buy from several sellers in one order?',
        'Yes. Items from different sellers ship separately, each with its own shipping charge and delivery estimate.',
      ],
      [
        'How do I become a seller?',
        'Create a Vendor account, complete your shop profile and submit it. An administrator reviews it before you can list products.',
      ],
      [
        'Why can I not see a product any more?',
        'A seller may have stopped selling it, run out of stock, or an administrator may have removed it from the marketplace.',
      ],
    ],
  },
  'shipping-delivery': {
    title: 'Shipping and delivery',
    description: 'How delivery dates and shipping charges are worked out.',
    sections: [
      {
        h: 'How delivery dates are estimated',
        p: [
          'The estimate combines the seller’s processing time, their daily dispatch cut-off, days the seller does not dispatch, how far the parcel must travel between PIN code zones, whether the seller serves your area, and the type of product (for example, frozen items only travel short distances and bulky furniture takes longer).',
          'Couriers do not deliver on Sundays or listed holidays, and dates move accordingly.',
        ],
      },
      {
        h: 'Shipping charges',
        p: [
          'Each seller sets their own shipping charge and may offer free shipping above an order value. If your order has items from several sellers, each seller’s shipment is charged separately. The exact amount is shown in your cart before you pay.',
        ],
      },
    ],
  },
  'returns-refunds': {
    title: 'Returns and refunds',
    description: 'How returns and refunds work on VP Mart.',
    sections: [
      {
        h: 'Returns',
        p: [
          'Return and refund requests are made from your order once it is delivered. Whether an item can be returned depends on its category and condition. This feature is being rolled out with order management.',
        ],
      },
      {
        h: 'Refunds',
        p: [
          'A refund is shown as complete only after it has been processed and confirmed. Until then it is shown as pending.',
        ],
      },
    ],
  },
  'cancellation-refund-policy': {
    policy: true,
    title: 'Cancellation and refund policy',
    description: 'When an order can be cancelled and how refunds are handled.',
    sections: [
      {
        h: 'Cancelling an order',
        p: [
          'An order can be cancelled before the seller hands it to a delivery agent. After that, use the return process once it is delivered.',
        ],
      },
      {
        h: 'Refunds',
        p: [
          'Refunds for paid orders go back to the original payment method after the cancellation or return is approved. Cash on Delivery orders that were never collected have nothing to refund.',
        ],
      },
    ],
  },
  'shipping-policy': {
    policy: true,
    title: 'Shipping policy',
    description: 'Shipping terms for orders placed on VP Mart.',
    sections: [
      {
        h: 'Who ships your order',
        p: [
          'Sellers prepare and pack orders. A delivery agent collects the package from the seller and delivers it to you. Each seller’s items travel as a separate shipment.',
        ],
      },
      {
        h: 'Delivery confirmation',
        p: [
          'You receive a one-time code for your order. Share it with the delivery agent only when you receive the package; the order is marked delivered only after the code is verified.',
        ],
      },
    ],
  },
  privacy: {
    policy: true,
    title: 'Privacy policy',
    description: 'What personal information VP Mart collects and how it is used.',
    sections: [
      {
        h: 'What we collect',
        p: [
          'Account details you provide (name, email, optional phone), addresses you save for delivery, your orders, and the shop and business details sellers submit.',
        ],
      },
      {
        h: 'How it is used',
        p: [
          'To run your account, process orders and deliveries, and keep the marketplace safe. A delivery agent sees your address and phone number only for a delivery assigned to them, and only when it is due.',
        ],
      },
      {
        h: 'Payments',
        p: [
          'Card and bank details are handled by the payment provider. VP Mart does not store full card numbers or CVV, and administrators only see masked identifiers.',
        ],
      },
      {
        h: 'Your choices',
        p: [
          'You can edit your profile, deactivate your account, or delete it from My Account. Records needed for accounting and legal obligations are kept without your personal identity.',
        ],
      },
    ],
  },
  terms: {
    policy: true,
    title: 'Terms and conditions',
    description: 'The terms for using VP Mart as a buyer, vendor or delivery agent.',
    sections: [
      {
        h: 'Using the marketplace',
        p: [
          'You are responsible for keeping your password secure and for the accuracy of the information you provide. Sellers are responsible for their listings, prices, stock and the legality of what they sell.',
        ],
      },
      {
        h: 'Prohibited items',
        p: [
          'Administrators may hide listings or suspend accounts that break marketplace rules or the law. Regulated products may only be sold by sellers who hold and have provided the required licences.',
        ],
      },
    ],
  },
  cookies: {
    policy: true,
    title: 'Cookie policy',
    description: 'The cookies VP Mart uses.',
    sections: [
      {
        h: 'Cookies we set',
        p: [
          'VP Mart uses only cookies needed for it to work: sign-in session cookies (not readable by page scripts) and a security token that protects your account from forged requests. Your delivery PIN code is kept in your browser’s local storage.',
        ],
      },
      {
        h: 'Tracking',
        p: ['The marketplace does not set advertising or third-party tracking cookies.'],
      },
    ],
  },
};

import { encodeFunctionData, erc20Abi, toHex, parseUnits, type Address } from 'viem';

// Minimal ABIs for required calls
const uniswapV3RouterAbi = [
  {
    type: 'function',
    name: 'exactOutputSingle',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountOut', type: 'uint256' },
          { name: 'amountInMaximum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountIn', type: 'uint256' }],
  },
] as const;

const erc4626Abi = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
] as const;

export function uintFromBase(amountBase: bigint): string {
  return toHex(amountBase, { size: 32 });
}

// approve(spender, amount)
export function encodeApprove(spender: string, amountBaseUnits: string): string {
  const amount = BigInt(amountBaseUnits);
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender as Address, amount],
  });
}

// exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
export function encodeExactOutputSingle(args: {
  tokenIn: string;
  tokenOut: string;
  fee: number; // e.g. 500
  recipient: string;
  deadline: number; // epoch seconds
  amountOutBaseUnits: string;
  amountInMaximumBaseUnits: string;
  sqrtPriceLimitX96?: number; // default 0
}): string {
  const amountOut = BigInt(args.amountOutBaseUnits);
  const amountInMaximum = BigInt(args.amountInMaximumBaseUnits);
  const sqrt = BigInt(args.sqrtPriceLimitX96 ?? 0);
  return encodeFunctionData({
    abi: uniswapV3RouterAbi,
    functionName: 'exactOutputSingle',
    args: [
      {
        tokenIn: args.tokenIn as Address,
        tokenOut: args.tokenOut as Address,
        fee: args.fee,
        recipient: args.recipient as Address,
        deadline: BigInt(args.deadline),
        amountOut,
        amountInMaximum,
        sqrtPriceLimitX96: sqrt,
      },
    ],
  });
}

// deposit(uint256 assets, address receiver)
export function encodeDeposit(args: { assetsBaseUnits: string; receiver: string }): string {
  const assets = BigInt(args.assetsBaseUnits);
  return encodeFunctionData({
    abi: erc4626Abi,
    functionName: 'deposit',
    args: [assets, args.receiver as Address],
  });
}

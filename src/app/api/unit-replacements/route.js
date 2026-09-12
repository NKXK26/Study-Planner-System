import { NextResponse } from 'next/server';
import prisma from '@utils/db/db';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import { replacementCandidates } from '@app/libs/unitReplacement.mjs';

export async function POST(req) {
  try {
    const dev = req.headers.get('x-dev-override') === 'true' && process.env.NEXT_PUBLIC_MODE === 'DEV';
    if (!dev && !await SecureSessionManager.authenticateUser(req)) return NextResponse.json({success:false,message:'Please sign in.'},{status:401});
    const input = await req.json();
    if (typeof input.code !== 'string' || !input.code.trim() || input.code.length > 40 || (input.name != null && (typeof input.name !== 'string' || input.name.length > 200))) return NextResponse.json({success:false,message:'Enter a unit code and a name of up to 200 characters.'},{status:400});
    const code = input.code.trim().toUpperCase();
    const units = await prisma.unit.findMany({select:{UnitCode:true,Name:true,CreditPoints:true,Availability:true,UnitTermOffered:{select:{TermType:true}}},orderBy:{ID:'asc'}});
    const originals = units.filter(u=>u.UnitCode.trim().toUpperCase()===code);
    const original = originals[0];
    const source = {code, name:original?.Name || input.name?.trim() || '', creditPoints:original?.CreditPoints ?? null, availability:original?.Availability ?? 'Not found', records:originals.length};
    if (!source.name) return NextResponse.json({success:false,message:'This code is not in the database. Enter its original unit name to search.'},{status:400});
    return NextResponse.json({success:true,source,suggestions:replacementCandidates(source,units),checkedAt:new Date().toISOString()});
  } catch (e) {
    console.error('Replacement search failed',e);
    return NextResponse.json({success:false,message:'Could not search replacement units. Please try again.'},{status:500});
  }
}

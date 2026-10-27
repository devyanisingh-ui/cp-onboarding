/**
 * Registers every feature's RPC functions. Each feature lives in its own folder
 * (server/features/<feature>/: its *.prisma models, services, RPC registration and tests) and
 * imports only from server/platform/ and earlier features' index.ts.
 */
import '../platform/health';
import './auth';
import './config';

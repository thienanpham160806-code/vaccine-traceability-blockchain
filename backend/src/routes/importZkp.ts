import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { contractClient } from '../contracts/client';
import { ipfsService } from '../services/ipfs';
import { importZkpService } from '../services/importZkp';
import { Logger } from '../utils/logger';
import { validateRequest } from '../middleware/validation';
import { verifyToken, AuthRequest } from '../middleware/auth';
import { importDocumentSchema } from '../schemas/productSchemas';

const router = Router();

const approveImportDocsSchema = z.object({
  approvedBy: z.string().trim().min(1).max(120).optional(),
  documents: z.array(importDocumentSchema).min(1).max(256),
});

/**
 * POST /import-zkp/approvals
 * Demo regulator flow: approve import documents, compute Poseidon Merkle root,
 * pin the approval snapshot to IPFS, and set the approved root on-chain.
 */
router.post('/approvals', verifyToken, validateRequest({ body: approveImportDocsSchema }), async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    if (role !== 'RECALL_AUTHORITY' && role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only recall authority or admin can approve import documents',
        },
      });
    }

    const { approvedBy = 'demo-regulator', documents } = req.body;

    const approval = await importZkpService.approveDocuments(documents, approvedBy);
    const ipfsResult = await ipfsService.pinJson(`approved-import-docs-${Date.now()}`, {
      approvedBy,
      approvedImportRoot: approval.root,
      documents: approval.records.map((record) => ({
        commitment: record.commitment,
        regulatorCertificateId: record.regulatorCertificateId,
        approvedAt: record.approvedAt,
      })),
    });

    let txHash: string | null = null;

    if (contractClient.isInitialized()) {
      const signerHasAdminRole = await contractClient.signerHasRole('admin', 'admin');
      if (!signerHasAdminRole) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ADMIN_ROLE_NOT_GRANTED',
            message: 'Backend admin signer does not have DEFAULT_ADMIN_ROLE on the active AccessControl contract.',
          },
        });
      }

      txHash = await contractClient.setApprovedImportRoot(approval.root, 'admin');
    }

    res.json({
      success: true,
      data: {
        approvedImportRoot: approval.root,
        totalDocuments: approval.records.length,
        commitments: approval.records.map((record) => record.commitment),
        ipfsCid: ipfsResult?.cid,
        txHash,
      },
    });
  } catch (error) {
    Logger.error('Approve import ZKP documents error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'IMPORT_ZKP_APPROVAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to approve import documents',
      },
    });
  }
});

router.get('/approvals', async (_req: Request, res: Response) => {
  try {
    const state = await importZkpService.getApprovedState();
    let onChainRoot: string | null = null;

    if (contractClient.isInitialized()) {
      onChainRoot = await contractClient.getApprovedImportRoot();
    }

    res.json({
      success: true,
      data: {
        approvedImportRoot: state.root,
        onChainRoot,
        totalDocuments: state.records.length,
        documents: state.records.map((record) => ({
          commitment: record.commitment,
          regulatorCertificateId: record.regulatorCertificateId,
          approvedBy: record.approvedBy,
          approvedAt: record.approvedAt,
        })),
      },
    });
  } catch (error) {
    Logger.error('Get import ZKP approvals error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'IMPORT_ZKP_APPROVALS_ERROR',
        message: 'Failed to fetch import ZKP approvals',
      },
    });
  }
});

export default router;

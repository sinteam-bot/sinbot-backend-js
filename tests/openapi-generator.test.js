import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { OpenApiGenerator } from '../src/core/openapi-generator.js';
import { Controller, Get, Post, Delete } from '../src/core/decorators.js';

describe('OpenApiGenerator Tests', () => {
    const tempDocsPath = path.join(__dirname, 'fixtures', 'temp-openapi.json');

    afterEach(() => {
        if (fs.existsSync(tempDocsPath)) {
            try {
                fs.unlinkSync(tempDocsPath);
            } catch {}
        }
    });

    it('should generate a valid OpenAPI 3.1.0 specification structure', () => {
        const generator = new OpenApiGenerator({
            title: 'Test API',
            version: '2.0.0',
            description: 'API de test unitaire'
        });

        const spec = generator.generateSpec();

        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info.title).toBe('Test API');
        expect(spec.info.version).toBe('2.0.0');
        expect(spec.info.description).toBe('API de test unitaire');
        expect(spec.paths).toBeDefined();
        expect(spec.components.securitySchemes.ApiKeyAuth).toBeDefined();
        expect(spec.components.securitySchemes.BearerAuth).toBeDefined();
        expect(spec.components.schemas.ApiResponse).toBeDefined();
    });

    it('should introspect module controllers and convert Express path parameters to OpenAPI format', () => {
        class MockTicketsController {
            listTickets() { return []; }
            getTicket() { return {}; }
            createTicket() { return {}; }
            deleteTicket() { return {}; }
        }

        Controller('/api/tickets')(MockTicketsController);
        Get('')(MockTicketsController.prototype, 'listTickets');
        Get('/:ticketId')(MockTicketsController.prototype, 'getTicket');
        Post('')(MockTicketsController.prototype, 'createTicket');
        Delete('/:ticketId')(MockTicketsController.prototype, 'deleteTicket');

        const mockModuleManager = {
            modules: [
                {
                    name: 'TicketsModule',
                    metadata: {
                        controllers: [MockTicketsController]
                    }
                }
            ]
        };

        const generator = new OpenApiGenerator();
        const spec = generator.generateSpec({ moduleManager: mockModuleManager });

        expect(spec.paths['/api/tickets']).toBeDefined();
        expect(spec.paths['/api/tickets'].get).toBeDefined();
        expect(spec.paths['/api/tickets'].post).toBeDefined();
        expect(spec.paths['/api/tickets'].get.tags).toContain('Tickets');

        expect(spec.paths['/api/tickets/{ticketId}']).toBeDefined();
        expect(spec.paths['/api/tickets/{ticketId}'].get).toBeDefined();
        expect(spec.paths['/api/tickets/{ticketId}'].delete).toBeDefined();

        const pathParams = spec.paths['/api/tickets/{ticketId}'].get.parameters.filter(p => p.in === 'path');
        expect(pathParams.length).toBe(1);
        expect(pathParams[0].name).toBe('ticketId');
        expect(pathParams[0].required).toBe(true);
    });

    it('should introspect Express router stack', () => {
        const app = express();
        const subRouter = express.Router();
        subRouter.get('/users/:userId', (req, res) => res.json({}));
        subRouter.post('/users', (req, res) => res.json({}));
        app.use('/api', subRouter);

        const generator = new OpenApiGenerator();
        const spec = generator.generateSpec({ app });

        expect(spec.paths['/api/users/{userId}']).toBeDefined();
        expect(spec.paths['/api/users/{userId}'].get).toBeDefined();
        expect(spec.paths['/api/users'].post).toBeDefined();
    });

    it('should export specification to a JSON file', () => {
        const generator = new OpenApiGenerator();
        const spec = generator.generateSpec();

        const success = generator.exportToFile(tempDocsPath, spec);
        expect(success).toBe(true);
        expect(fs.existsSync(tempDocsPath)).toBe(true);

        const content = JSON.parse(fs.readFileSync(tempDocsPath, 'utf8'));
        expect(content.openapi).toBe('3.1.0');
    });

    it('should generate Scalar HTML reference page', () => {
        const generator = new OpenApiGenerator({ title: 'My Discord Bot' });
        const html = generator.getScalarHtml({ specUrl: '/api/docs/openapi.json' });

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('My Discord Bot — Documentation API');
        expect(html).toContain('data-url="/api/docs/openapi.json"');
        expect(html).toContain('@scalar/api-reference');
    });
});

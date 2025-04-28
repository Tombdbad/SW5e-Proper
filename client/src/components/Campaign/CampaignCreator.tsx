import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TranslucentPane from '@/components/ui/TranslucentPane';
import { starSystems } from '@/lib/sw5e/locations';
import { queryClient } from '@/lib/queryClient';
import { motion } from 'framer-motion';

const campaignSchema = z.object({
  name: z.string().min(2, {
    message: "Campaign name must be at least 2 characters.",
  }),
  description: z.string().min(10, {
    message: "Description must be at least 10 characters.",
  }),
  era: z.string({
    required_error: "Please select an era.",
  }),
  location: z.string({
    required_error: "Please select a primary location.",
  }),
  threat: z.string({
    required_error: "Please select a primary threat.",
  }),
});

type CampaignFormValues = z.infer<typeof campaignSchema>;

export default function CampaignCreator() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: '',
      description: '',
      era: '',
      location: '',
      threat: '',
    },
  });

  const onSubmit = async (data: CampaignFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to create campaign');
      }
      
      // Invalidate campaigns query to refresh list
      queryClient.invalidateQueries(['campaigns']);
      
      // Navigate to campaigns list
      navigate('/campaigns');
    } catch (error) {
      console.error('Error creating campaign:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-4xl"
      >
        <TranslucentPane className="p-6">
          <h1 className="text-3xl font-bold text-yellow-400 mb-8">Create a New Campaign</h1>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Campaign Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your campaign name..." {...field} className="bg-gray-800/50" />
                    </FormControl>
                    <FormDescription>
                      The name of your Star Wars campaign.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Campaign Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe your campaign..." 
                        className="min-h-32 bg-gray-800/50"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      A brief summary of your campaign's plot and setting.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="era"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-lg">Era</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-gray-800/50">
                            <SelectValue placeholder="Select an era" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="high-republic">High Republic</SelectItem>
                          <SelectItem value="fall-republic">Fall of the Republic</SelectItem>
                          <SelectItem value="imperial">Imperial Era</SelectItem>
                          <SelectItem value="new-republic">New Republic</SelectItem>
                          <SelectItem value="first-order">First Order/Resistance</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The historical period of your campaign.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-lg">Primary Location</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-gray-800/50">
                            <SelectValue placeholder="Select a location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {starSystems.map((system) => (
                            <SelectItem key={system.id} value={system.id}>
                              {system.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The main star system where your campaign takes place.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="threat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-lg">Primary Threat</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-gray-800/50">
                            <SelectValue placeholder="Select a threat" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="empire">Galactic Empire</SelectItem>
                          <SelectItem value="sith">Sith Lords</SelectItem>
                          <SelectItem value="criminals">Criminal Syndicates</SelectItem>
                          <SelectItem value="separatists">Separatists</SelectItem>
                          <SelectItem value="first-order">First Order</SelectItem>
                          <SelectItem value="custom">Custom Threat</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The main antagonistic force in your campaign.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  {isSubmitting ? "Creating..." : "Create Campaign"}
                </Button>
              </div>
            </form>
          </Form>
        </TranslucentPane>
      </motion.div>
    </div>
  );
}
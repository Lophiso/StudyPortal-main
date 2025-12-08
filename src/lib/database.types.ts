export type Database = {
  public: {
    Tables: {
      programs: {
        Row: {
          id: number;
          title: string;
          university: string;
          country: string;
          tuition_fee: number;
          currency: string;
          duration_months: number;
          study_level: string;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          title: string;
          university: string;
          country: string;
          tuition_fee: number;
          currency?: string;
          duration_months: number;
          study_level: string;
          description: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          title?: string;
          university?: string;
          country?: string;
          tuition_fee?: number;
          currency?: string;
          duration_months?: number;
          study_level?: string;
          description?: string;
          created_at?: string;
        };
      };
    };
  };
};

export type Program = Database['public']['Tables']['programs']['Row'];
